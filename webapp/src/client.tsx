import {Client4} from 'mattermost-redux/client';

import {UserProfile} from 'mattermost-redux/types/users';

import getSiteURL from 'components/utils';

import {id as PluginId} from './manifest';
import {CalendarSettings} from './types/settings';

export declare type GetEventResponse = {
    id: string;
    title: string;
    start: string;
    end: string;
    attendees: UserProfile[];
    created: string;
    owner: string;
    channel?: string;
    recurrence: string;
    color?: string
    description: string;
    team: string
    visibility: string
    alert: string
    accepted?: string[];
}

export declare type GetEventsResponse = {
    id: string;
    title: string;
    start: string;
    end: string;
    created: string;
    owner: string;
    color?: string;
}
export declare type RemoveEventResponse = {
    success: boolean
}

export declare type UsersScheduleEvent = {
    start: string;
    end: string;
    duration: number;
}

export declare type UsersScheduleResponse = {
    users: Map<string, UsersScheduleEvent>
    available_times: string[]
}

export declare type EventApiResponse = {
    event: GetEventResponse;
    accepted: string[];
};

export declare type ApiResponse<Type> = {
    data: Type
}

export declare class ApiClientInterface {
    static getEventById(event: string): Promise<GetEventResponse>

    static getEvents(): Promise<GetEventsResponse>

    static createEvent(title: string, start: string, end: string, attendees: string[]): Promise<GetEventResponse>
}

export class ApiClient implements ApiClientInterface {
    static async getEventById(event: string): Promise<ApiResponse<EventApiResponse>> {
        const response = await fetch(
            getSiteURL() + `/plugins/${PluginId}/events/${event}`,
            Client4.getOptions({
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },

            }),
        );
        const data = await response.json();
        // eslint-disable-next-line no-negated-condition
        if (data.data.event.attendees != null) {
            if (data.data.event.attendees.length > 0) {
                const users = await this.getUsersByIds(data.data.event.attendees);
                data.data.event.attendees = users;
            }
        } else {
            data.data.event.attendees = [];
        }
        // Pass accepted as-is (array of user IDs)
        if (data.data.accepted) {
            data.data.event.accepted = data.data.accepted;
        }
        return data;
    }

    static async getEvents(): Promise<GetEventsResponse> {
        throw new Error('Method not implemented.');
    }

    static async removeEvent(event: string): Promise<ApiResponse<RemoveEventResponse>> {
        const response = await fetch(
            getSiteURL() + `/plugins/${PluginId}/events/${event}`,
            Client4.getOptions({
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },

            }),
        );
        const data = await response.json();
        return data;
    }

    static async getUsersByIds(users: string[]): Promise<UserProfile[]> {
        const response = await fetch(
            getSiteURL() + '/api/v4/users/ids',
            Client4.getOptions({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(users),

            }),
        );
        const data = await response.json();
        return data;
    }

    static async createEvent(
        title: string,
        start: string,
        end: string,
        attendees: string[],
        description: string,
        team: string,
        visibility: string,
        channel?: string,
        recurrence?: string,
        color?: string,
        alert?: string,
    ): Promise<ApiResponse<GetEventResponse>> {
        const response = await fetch(
            getSiteURL() + `/plugins/${PluginId}/events`,
            Client4.getOptions({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title,
                    start,
                    end,
                    attendees,
                    description,
                    team,
                    visibility,
                    channel,
                    recurrence,
                    color,
                    alert,
                }),
            }),
        );
        const data = await response.json();
        return data;
    }

    static async updateEvent(
        id: string,
        title: string,
        start: string,
        end: string,
        attendees: string[],
        description: string,
        team: string,
        visibility: string,
        channel?: string,
        recurrence?: string,
        color?: string,
        alert?: string,
    ): Promise<ApiResponse<GetEventResponse>> {
        const response = await fetch(
            getSiteURL() + `/plugins/${PluginId}/events`,
            Client4.getOptions({
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id,
                    title,
                    start,
                    end,
                    attendees,
                    description,
                    team,
                    visibility,
                    channel,
                    recurrence,
                    color,
                    alert,
                }),
            }),
        );
        const data = await response.json();
        return data;
    }

    static async getCalendarSettings(): Promise<CalendarSettings> {
        const response = await fetch(
            getSiteURL() + `/plugins/${PluginId}/settings`,
            Client4.getOptions({
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            }),
        );
        const data = await response.json();
        return data.data;
    }

    static async getUsersSchedule(users: string[], start: string, end: string, slotTime: number): Promise<UsersScheduleResponse> {
        const response = await fetch(
            getSiteURL() + `/plugins/${PluginId}/schedule?` + new URLSearchParams({
                users: users.join(','),
                slot_time: slotTime.toString(),
                start,
                end,
            }),
            Client4.getOptions({
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            }),
        );
        const data = await response.json();
        return data.data;
    }

    static async updateCalendarSettings(settings: CalendarSettings): Promise<CalendarSettings> {
        const response = await fetch(
            getSiteURL() + `/plugins/${PluginId}/settings`,
            Client4.getOptions({
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    isOpenCalendarLeftBar: settings.isOpenCalendarLeftBar,
                    firstDayOfWeek: settings.firstDayOfWeek,
                    hideNonWorkingDays: settings.hideNonWorkingDays,
                }),
            }),
        );
        const data = await response.json();
        return data.data;
    }

    static async getNotificationSetting(eventId: string): Promise<string | null> {
        const response = await fetch(
            getSiteURL() + `/plugins/${PluginId}/events/${eventId}/notification_setting`,
            Client4.getOptions({
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            }),
        );
        const data = await response.json();
        return data.data.notification_setting ?? null;
    }

    static async setNotificationSetting(eventId: string, notificationSetting: string): Promise<boolean> {
        const response = await fetch(
            getSiteURL() + `/plugins/${PluginId}/events/${eventId}/notification_setting`,
            Client4.getOptions({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ notification_setting: notificationSetting }),
            }),
        );
        const data = await response.json();
        return data.data.success === true;
    }
}