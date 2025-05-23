package main

import (
	"fmt"
	"time"

	sq "github.com/Masterminds/squirrel"
	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/teambition/rrule-go"
)

const wsEventOccur = "event_occur"

type Background struct {
	Ticker *time.Ticker
	Done   chan bool
	plugin *Plugin
}

func (b *Background) Start() {
	for {
		select {
		case <-b.Done:
			return
		case t := <-b.Ticker.C:
			b.process(t)
		}
	}
}

func (b *Background) Stop() {
	b.Done <- true
}

func (b *Background) getMessageFromEvent(event *Event, processTime time.Time) string {
	message := ""

	if event.AlertTime != nil && processTime.Equal(*event.AlertTime) {
		alertTitle, ok := EventAlertTitleMap[event.Alert]
		if !ok {
			alertTitle = ""
		}
		message += fmt.Sprintf(":alarm_clock: **%s** *%s* :alarm_clock:\n", alertTitle, event.Title)
	} else {
		message += fmt.Sprintf(":dart: *%s* :dart:\n", event.Title)
	}
	if len(event.Attendees) > 0 {
		members := ""
		for _, member := range event.Attendees {
			user, userErr := b.plugin.API.GetUser(member)

			if userErr != nil {
				continue
			}

			members += fmt.Sprintf("@%s, ", user.Username)
		}
		message += fmt.Sprintf("**members:** %s\n", members)
	}

	if event.Description != "" {
		message += fmt.Sprintf("**description:**\n%s", event.Description)
	}

	return message
}

func (b *Background) sendGroupOrPersonalEventNotification(event *Event, processTime time.Time) {
	var attendees []string

	attendees = append(attendees, event.Attendees...)

	if len(attendees) == 0 {
		dChannel, dChannelErr := b.plugin.API.GetDirectChannel(event.Owner, b.plugin.BotId)
		if dChannelErr != nil {
			b.plugin.API.LogError(dChannelErr.Error())
			return
		}
		postModel := &model.Post{
			UserId:    b.plugin.BotId,
			ChannelId: dChannel.Id,
		}
		postModel.SetProps(b.getMessageProps(event, processTime))
		_, postCreateError := b.plugin.API.CreatePost(postModel)
		if postCreateError != nil {
			b.plugin.API.LogError(postCreateError.Error())
			return
		}
		return
	}

	if !contains[string](attendees, event.Owner) {
		attendees = append(attendees, event.Owner)
	}

	attendees = append(attendees, b.plugin.BotId)

	foundChannel, foundChannelError := b.plugin.API.GetGroupChannel(attendees)

	if foundChannelError != nil {
		b.plugin.API.LogError(foundChannelError.Error())
		return
	}

	postModel := &model.Post{
		UserId:    b.plugin.BotId,
		ChannelId: foundChannel.Id,
	}

	postModel.SetProps(b.getMessageProps(event, processTime))

	if _, postCreateError := b.plugin.API.CreatePost(postModel); postCreateError != nil {
		b.plugin.API.LogError(postCreateError.Error())
		return
	}

}

func (b *Background) process(t time.Time) {
	// convert time to UTC, if server can be in different timezones
	t = t.In(time.UTC)

	tickWithZone := time.Date(
		t.Year(),
		t.Month(),
		t.Day(),
		t.Hour(),
		t.Minute(),
		0,
		0,
		time.UTC,
	)

	// different queries for different databases because of different time format
	var recurrentTimeQuery sq.And
	switch b.plugin.DB.DriverName() {
	case POSTGRES:
		recurrentTimeQuery = sq.And{
			sq.Eq{"ce.recurrent": true},
			sq.Or{
				sq.Eq{"ce.dt_start::time": tickWithZone},
				sq.Eq{"ce.alert_time::time": tickWithZone},
			},
		}
	case MYSQL:
		recurrentTimeQuery = sq.And{
			sq.Eq{"ce.recurrent": true},
			sq.Or{
				sq.Eq{"TIME(ce.dt_start)": tickWithZone},
				sq.Eq{"TIME(ce.alert_time)": tickWithZone},
			},
		}
	default:
		recurrentTimeQuery = sq.And{
			sq.Eq{"ce.recurrent": true},
			sq.Or{
				sq.Eq{"ce.dt_start::time": tickWithZone},
				sq.Eq{"ce.alert_time::time": tickWithZone},
			},
		}
	}

	queryBuilder := sq.Select().
		Columns(
			"ce.id",
			"ce.title",
			"ce.dt_start",
			"ce.dt_end",
			"ce.created",
			"ce.owner",
			"ce.channel",
			"cm.member",
			"ce.recurrent",
			"ce.recurrence",
			"ce.color",
			"ce.description",
			"ce.alert_time",
			"ce.alert",
			"ce.team",
		).
		From("calendar_events ce").
		LeftJoin("calendar_members cm ON ce.id = cm.event").
		Where(sq.And{
			sq.Or{
				sq.Eq{"ce.dt_start": tickWithZone},
				sq.Eq{"ce.alert_time": tickWithZone},
				recurrentTimeQuery,
			},
			sq.Or{
				sq.Eq{"ce.processed": nil},
				sq.NotEq{"ce.processed": tickWithZone},
			},
		}).
		PlaceholderFormat(b.plugin.GetDBPlaceholderFormat())

	querySql, argsSql, builderErr := queryBuilder.ToSql()

	if builderErr != nil {
		b.plugin.API.LogError(builderErr.Error())
		return
	}
	rows, errSelect := b.plugin.DB.Queryx(querySql, argsSql...)

	if errSelect != nil {
		b.plugin.API.LogError(errSelect.Error())
		return
	}

	type EventFromDb struct {
		Event
		User *string `json:"user" db:"member"`
	}
	events := map[string]*Event{}

	for rows.Next() {
		var eventDb EventFromDb
		errScan := rows.StructScan(&eventDb)

		if errScan != nil {
			b.plugin.API.LogError(errScan.Error())
			continue
		}

		if events[eventDb.Id] != nil && eventDb.User != nil {
			events[eventDb.Id].Attendees = append(events[eventDb.Id].Attendees, *eventDb.User)
		} else {
			if eventDb.Recurrent {
				eventRule, errRrule := rrule.StrToRRule(eventDb.Recurrence)
				if errRrule != nil {
					b.plugin.API.LogError(errRrule.Error())
					continue
				}
				eventTime := eventDb.End.Sub(eventDb.Start)
				eventEnd := tickWithZone.Add(eventTime)
				eventRule.DTStart(time.Date(
					eventDb.Start.Year(),
					eventDb.Start.Month(),
					eventDb.Start.Day(),
					0,
					0,
					0,
					0,
					time.UTC,
				))
				eventDates := eventRule.Between(
					time.Date(
						tickWithZone.Year(),
						tickWithZone.Month(),
						tickWithZone.Day(),
						0,
						0,
						0,
						0,
						time.UTC,
					),
					eventEnd,
					true)
				// Skip this event if recurrent event doesn't exist between two dates
				if len(eventDates) < 1 {
					continue
				}
				recEventTime := eventDb.End.Sub(eventDb.Start)
				eventDb.Start = time.Date(
					tickWithZone.Year(),
					tickWithZone.Month(),
					tickWithZone.Day(),
					eventDb.Start.Hour(),
					eventDb.Start.Minute(),
					eventDb.Start.Second(),
					eventDb.Start.Nanosecond(),
					eventDb.Start.Location(),
				)

				eventDb.End = eventDb.Start.Add(recEventTime)

				//	calc alert time for recurrent event with alert name
				if eventDb.Alert != EventAlertNone {
					alertDuration, ok := EventAlertDurationMap[eventDb.Alert]
					if !ok {
						alertDuration = 0
					}
					alertTime := eventDb.Start.Add(-1 * alertDuration)
					eventDb.AlertTime = &alertTime
				}
			}

			var att []string
			if eventDb.User != nil {
				att = append(att, *eventDb.User)
			}
			events[eventDb.Id] = &Event{
				Id:          eventDb.Id,
				Title:       eventDb.Title,
				Start:       eventDb.Start,
				End:         eventDb.End,
				Attendees:   att,
				Created:     eventDb.Created,
				Owner:       eventDb.Owner,
				Channel:     eventDb.Channel,
				Recurrence:  eventDb.Recurrence,
				Recurrent:   false,
				Color:       eventDb.Color,
				Description: eventDb.Description,
				Team:        eventDb.Team,
				Alert:       eventDb.Alert,
				AlertTime:   eventDb.AlertTime,
			}

		}
	}

	// send notifications, create posts and update processed field
	for _, value := range events {
		b.sendWsNotification(value, tickWithZone)
		if value.Channel != nil {
			postModel := &model.Post{
				ChannelId: *value.Channel,
				UserId:    b.plugin.BotId,
			}

			postModel.SetProps(b.getMessageProps(value, tickWithZone))
			_, postErr := b.plugin.API.CreatePost(postModel)
			if postErr != nil {
				b.plugin.API.LogError(postErr.Error())
				continue
			}

		} else {
			b.sendGroupOrPersonalEventNotification(value, tickWithZone)
		}

		updateBuilder := sq.Update("calendar_events").
			Set("processed", tickWithZone).
			Where(sq.Eq{"id": value.Id}).
			PlaceholderFormat(b.plugin.GetDBPlaceholderFormat())
		updateSql, updateArgs, updateErrBuilder := updateBuilder.ToSql()

		if updateErrBuilder != nil {
			b.plugin.API.LogError(updateErrBuilder.Error())
			continue
		}
		if _, errUpdate := b.plugin.DB.Queryx(updateSql, updateArgs...); errUpdate != nil {
			b.plugin.API.LogError(errUpdate.Error())
			continue
		}

	}

}

func (b *Background) sendWsNotification(event *Event, processTime time.Time) {
	var attendees []string

	attendees = append(attendees, event.Attendees...)
	if !contains(attendees, event.Owner) {
		attendees = append(attendees, event.Owner)
	}

	for _, user := range attendees {
		b.plugin.API.PublishWebSocketEvent(wsEventOccur, map[string]interface{}{
			"id":      event.Id,
			"title":   event.Title,
			"channel": nil,
		}, &model.WebsocketBroadcast{
			UserId: user,
		})
	}

}
func (b *Background) getMessageProps(event *Event, processTime time.Time) model.StringInterface {
	color := DefaultColor
	if event.Color == nil {
		event.Color = &color
	}

	slackAttachment := model.SlackAttachment{
		Text:  b.getMessageFromEvent(event, processTime),
		Color: *event.Color,
	}

	return model.StringInterface{
		"attachments": []*model.SlackAttachment{&slackAttachment},
	}
}

var bgJob *Background

func NewBackgroundJob(plugin *Plugin) *Background {
	if bgJob == nil {
		bgJob = &Background{
			Ticker: time.NewTicker(15 * time.Second),
			Done:   make(chan bool),
			plugin: plugin,
		}
	}
	return bgJob
}

func GetBackgroundJob() *Background {
	return bgJob
}
