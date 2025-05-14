import React, { useEffect, useState } from 'react';
import { Client4 } from 'mattermost-redux/client';
import { UserProfile } from 'mattermost-redux/types/users';
import { Channel } from 'mattermost-redux/types/channels';

import { useDispatch, useSelector } from 'react-redux';

import { getCurrentTeamId, getCurrentTeam } from 'mattermost-redux/selectors/entities/teams';
import { getUserStatuses, makeGetProfilesInChannel, getCurrentUser } from 'mattermost-redux/selectors/entities/users';
import { getTeammateNameDisplaySetting } from 'mattermost-redux/selectors/entities/preferences';
import { getProfilesInChannel } from 'mattermost-redux/actions/users';

// importing the editor and the plugin from their full paths
import {
    Eye24Regular,
    ChatMultiple24Regular,
    Circle20Filled,
    Clock24Regular,
    Delete16Regular,
    Dismiss12Regular,
    Pen24Regular,
    PersonAdd24Regular,
    Save16Regular,
    TextDescription24Regular,
    PeopleTeam24Regular
} from '@fluentui/react-icons';
import {
    Button,
    Combobox,
    Dialog,
    DialogActions,
    DialogBody,
    DialogContent,
    DialogSurface,
    DialogTitle,
    DialogTrigger,
    Input,
    Option,
    OptionGroup,
    Persona,
    Skeleton,
    SkeletonItem,
    Spinner,
    Textarea,
    Toolbar,
    ToolbarButton,
    Tag,
    useId,
    Toast,
    ToastIntent,
    ToastTitle,
    useToastController,
    Toaster
} from '@fluentui/react-components';
import { format, parse, set } from 'date-fns';
import { InputOnChangeData } from '@fluentui/react-input';

import roundToNearestMinutes from 'date-fns/roundToNearestMinutes';

import { GlobalState } from 'mattermost-redux/types/store';

import { closeEventModal, eventSelected, updateMembersAddedInEvent, updateSelectedEventTime } from 'actions';
import { getMembersAddedInEvent, getSelectedEventTime, selectIsOpenEventModal, selectSelectedEvent } from 'selectors';
import { ApiClient } from 'client';
import type { EventApiResponse } from 'client';

import RepeatEventCustom from './repeat-event';

import CalendarRef from './calendar';
import TimeSelector from './time-selector';
import PlanningAssistant from './planning-assistant';
import EventAlertSelect from "./alert-input";
import VisibilitySelect from './visibility-input';

interface AddedUserComponentProps {
    user: UserProfile
}

interface TimeSelectItemsProps {
    start?: string;
    end?: string;
}

type SelectionEvents =
    React.ChangeEvent<HTMLElement>
    | React.KeyboardEvent<HTMLElement>
    | React.MouseEvent<HTMLElement, MouseEvent>
declare type OptionOnSelectData = {
    optionValue: string | undefined;
    optionText: string | undefined;
    selectedOptions: string[];
};

const initialStartTime = (): string => {
    return format(roundToNearestMinutes(new Date(), {
        nearestTo: 30,
        roundingMethod: 'ceil',
    }), 'HH:mm');
};

const initialEndTime = (): string => {
    const dt = new Date();
    dt.setMinutes(dt.getMinutes() + 30);
    return format(roundToNearestMinutes(dt, {
        nearestTo: 30,
        roundingMethod: 'ceil',
    }), 'HH:mm');
};

const EventModalComponent = () => {
    const selectedEvent = useSelector(selectSelectedEvent);
    const isOpenEventModal = useSelector(selectIsOpenEventModal);

    const displayNameSettings = useSelector(getTeammateNameDisplaySetting);

    const CurrentTeamId = useSelector(getCurrentTeamId);
    const CurrentTeam = useSelector(getCurrentTeam);

    const UserStatusSelector = useSelector(getUserStatuses);
    const selectedEventTime = useSelector(getSelectedEventTime);

    const dispatch = useDispatch();

    const initialDate = new Date();

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const usersMentionTags: {
        [name: string]: string
    } = {
        '@channel': 'users from channel',
    };
    const [usersAutocomplete, setUsersAutocomplete] = useState<UserProfile[]>([]);

    const [searchUsersInput, setSearchUsersInput] = useState('');

    const [selectedAlert, setSelectedAlert] = useState('');
    const [selectedColor, setSelectedColor] = useState('#D0D0D0');
    const [selectedColorStyle, setSelectedColorStyle] = useState('event-color-default');

    const [channelsAutocomplete, setChannelsAutocomplete] = useState<Channel[]>([]);
    const [selectedChannel, setSelectedChannel] = useState({});
    const [selectedChannelText, setSelectedChannelText] = useState('');

    const [selectedVisibility, setSelectedVisibility] = useState('private')

    const [isPlanningAssistantOpen, setIsPlanningAssistantOpen] = useState(false);
    const inputEventTitleRef = React.useRef<HTMLInputElement>(null);

    const getProfilesInChannelSelector = makeGetProfilesInChannel();
    const profilesInCurrentChannelSelector = (state: GlobalState) => getProfilesInChannelSelector(state, selectedChannel?.id);
    const profilesInChannel = useSelector(profilesInCurrentChannelSelector);

    const usersAddedInEvent = useSelector(getMembersAddedInEvent);

    const [titleEvent, setTitleEvent] = useState('');
    const [descriptionEvent, setDescriptionEvent] = useState('');

    const [repeatRule, setRepeatRule] = useState<string>('');
    const [showCustomRepeat, setShowCustomRepeat] = useState(false);
    const [repeatOption, setRepeatOption] = useState("Don't repeat");
    const [repeatOptionsSelected, setRepeatOptionsSelected] = useState(['empty']);

    const toasterId = useId("toasterEventForm");
    const { dispatchToast } = useToastController(toasterId);

    const currentUser = useSelector(getCurrentUser);
    const [canEdit, setCanEdit] = useState(true);
    const [isInterested, setIsInterested] = useState(false);

    const [acceptedUsers, setAcceptedUsers] = useState<UserProfile[]>([]);

    const notificationOptions = [
        { value: '', label: 'None' },
        { value: '5_minutes_before', label: '5 minutes before' },
        { value: '15_minutes_before', label: '15 minutes before' },
        { value: '30_minutes_before', label: '30 minutes before' },
        { value: '1_hour_before', label: '1 hour before' },
        { value: '2_hours_before', label: '2 hours before' },
        { value: '1_day_before', label: '1 day before' },
        { value: '2_days_before', label: '2 days before' },
        { value: '1_week_before', label: '1 week before' },
    ];
    const [notificationSetting, setNotificationSetting] = useState<string>('');
    const [notificationSaving, setNotificationSaving] = useState<boolean>(false);

    // methods
    const viewEventModalHandleClose = () => {
        cleanState();
        dispatch(closeEventModal());
        dispatch(eventSelected({}));
    };

    const cleanState = () => {
        setTitleEvent('');
        setDescriptionEvent('');

        setIsSaving(false);
        setIsLoading(false);

        dispatch(updateSelectedEventTime({
            start: initialDate,
            end: initialDate,
            startTime: initialStartTime(),
            endTime: initialEndTime(),
        }));

        setUsersAutocomplete([]);
        setChannelsAutocomplete([]);
        setSelectedChannelText('');
        setSelectedChannel({});
        setSearchUsersInput('');

        // repeat state
        setShowCustomRepeat(false);
        setRepeatOptionsSelected(['empty']);
        setRepeatOption('Don\'t repeat');
        setRepeatRule('');

        setSelectedChannel({});
        dispatch(updateMembersAddedInEvent([]));
        setSelectedColor('#D0D0D0');

        setSelectedVisibility('private');
        setSelectedAlert('');
    };

    const onTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setTitleEvent(event.target.value);
    };

    const onStartDateChange = (event: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData) => {
        dispatch(updateSelectedEventTime({ start: parse(data.value, 'yyyy-MM-dd', new Date()) }));
    };

    const onEndDateChange = (event: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData) => {
        dispatch(updateSelectedEventTime({ end: parse(data.value, 'yyyy-MM-dd', new Date()) }));
    };

    const onInputUserAction = async (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchUsersInput(event.target.value);
        if (event.target.value !== '') {
            const resp = await Client4.searchUsers(event.target.value, '');
            setUsersAutocomplete(resp);
        }
    };

    const onSelectChannelOption = (event: SelectionEvents, data: OptionOnSelectData) => {
        channelsAutocomplete.map((option) => {
            if (option.id === data.optionValue) {
                setSelectedChannel(option);
                setSelectedChannelText(option.display_name);
                dispatch(getProfilesInChannel(option.id, 0, 1000));
            }
        });
    };

    const onInputChannelAction = async (event: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedChannelText(event.target.value);
        if (event.target.value !== '') {
            const resp = await Client4.autocompleteChannels(CurrentTeamId, event.target.value);
            setChannelsAutocomplete(resp);
        } else {
            // if channel input empty, remove selected channel
            setSelectedChannel({});
        }
    };

    const onSaveEvent = async () => {

        if (selectedVisibility === "channel" && Object.keys(selectedChannel).length === 0) {
            dispatchToast(
                <Toast>
                    <ToastTitle></ToastTitle>
                    {'You selected channel visibility but you didn\'t select a channel'} 
                </Toast>,
                { intent: 'error' }
            );
            return;
        }

        const members: string[] = usersAddedInEvent.map((user: UserProfile) => user.id);
        let repeat = '';
        if (repeatOption === 'Custom') {
            repeat = repeatRule;
        }
        setIsSaving(true);
        if (selectedEvent?.event?.id == null) {
            const response = await ApiClient.createEvent(
                titleEvent,
                format(selectedEventTime.start, 'yyyy-MM-dd') + 'T' + selectedEventTime.startTime + ':00Z',
                format(selectedEventTime.end, 'yyyy-MM-dd') + 'T' + selectedEventTime.endTime + ':00Z',
                members,
                descriptionEvent,
                CurrentTeamId,
                selectedVisibility,
                Object.keys(selectedChannel).length !== 0 ? selectedChannel.id : null,
                repeat,
                selectedColor,
                selectedAlert,
            );
            CalendarRef.current.getApi().getEventSources()[0].refetch();
            cleanState();
            viewEventModalHandleClose();
        } else {
            const response = await ApiClient.updateEvent(
                selectedEvent.event.id,
                titleEvent,
                format(selectedEventTime.start, 'yyyy-MM-dd') + 'T' + selectedEventTime.startTime + ':00Z',
                format(selectedEventTime.end, 'yyyy-MM-dd') + 'T' + selectedEventTime.endTime + ':00Z',
                members,
                descriptionEvent,
                CurrentTeamId,
                selectedVisibility,
                Object.keys(selectedChannel).length !== 0 ? selectedChannel.id : null,
                repeat,
                selectedColor,
                selectedAlert,
            );
            CalendarRef.current.getApi().getEventSources()[0].refetch();
            cleanState();
            viewEventModalHandleClose();
        }
        setIsSaving(false);
    };

    const onRemoveEvent = async () => {
        await ApiClient.removeEvent(selectedEvent.event.id);
        CalendarRef.current.getApi().getEventSources()[0].refetch();
        cleanState();
        viewEventModalHandleClose();
    };

    const colorsMap: {
        [name: string]: string
    } = {
        '': 'event-color-default',
        default: 'event-color-default',
        '#F2B3B3': 'event-color-red',
        '#FCECBE': 'event-color-yellow',
        '#B6D9C7': 'event-color-green',
        '#B3E1F7': 'event-color-blue',
    };
    const onSelectColor = (event: SelectionEvents, data: OptionOnSelectData) => {
        setSelectedColor(data.optionValue!);
        setSelectedColorStyle(colorsMap[data.optionValue!]);
    };

    useEffect(() => {
        let mounted = true;
        if (mounted && selectedEvent?.event?.id != null) {
            setIsLoading(true);
            ApiClient.getEventById(selectedEvent.event.id).then(async (data: { data: EventApiResponse }) => {
                setTitleEvent(data.data.event.title);
                setDescriptionEvent(data.data.event.description);

                const startEventResp: Date = parse(data.data.event.start, "yyyy-MM-dd'T'HH:mm:ssxxx", new Date());
                const endEventResp: Date = parse(data.data.event.end, "yyyy-MM-dd'T'HH:mm:ssxxx", new Date());
                dispatch(updateSelectedEventTime({
                    start: startEventResp,
                    end: endEventResp,
                    startTime: format(startEventResp, 'HH:mm'),
                    endTime: format(endEventResp, 'HH:mm'),
                }));
                dispatch(updateMembersAddedInEvent(data.data.event.attendees));

                setSelectedColor(data.data.event.color!);
                setSelectedColorStyle(colorsMap[data.data.event.color!]);
                setSelectedVisibility(data.data.event.visibility);
                setSelectedAlert(data.data.event.alert);

                if (data.data.event.recurrence.length !== 0) {
                    setRepeatRule(data.data.event.recurrence);
                    setRepeatOption('Custom');
                    setShowCustomRepeat(true);
                }

                if (data.data.event.channel != null) {
                    Client4.getChannel(data.data.event.channel).then((channel: Channel) => {
                        setSelectedChannel(channel);
                        setSelectedChannelText(channel.display_name);
                    });
                }

                // Permission logic: allow edit if current user is owner, system admin, or team admin
                const isOwner = currentUser?.id === data.data.event.owner;
                const isSysAdmin = currentUser?.roles?.includes('system_admin');
                const isTeamAdmin = currentUser?.roles?.includes('team_admin') || (data.data.event.team && currentUser?.roles?.includes(`team_admin:${data.data.event.team}`));
                setCanEdit(isOwner || isSysAdmin || isTeamAdmin);
                // Fetch interest status
                fetch(`/plugins/calendar/events/${selectedEvent.event.id}/interested`, { method: 'GET', credentials: 'same-origin' })
                    .then(res => res.json())
                    .then(res => {
                        if (res.data && typeof res.data.interested === 'boolean') {
                            setIsInterested(res.data.interested);
                        }
                    });
                // Fetch accepted users' profiles
                if (data.data.accepted && data.data.accepted.length > 0) {
                    const users = await ApiClient.getUsersByIds(data.data.accepted);
                    setAcceptedUsers(users);
                } else {
                    setAcceptedUsers([]);
                }
                // Fetch notification setting for this user/event
                const notif = await ApiClient.getNotificationSetting(selectedEvent.event.id);
                setNotificationSetting(notif || '');
                setIsLoading(false);
            });
        } else if (mounted && selectedEvent?.event?.id == null && selectedEvent?.event?.start != null) {
            dispatch(updateSelectedEventTime({
                start: selectedEvent?.event.start,
                end: selectedEvent?.event.end,
                startTime: format(selectedEvent?.event.start, 'HH:mm'),
                endTime: format(selectedEvent?.event.end, 'HH:mm'),
            }));
        }
        mounted = false;
    }, [selectedEvent, currentUser]);

    const getDisplayUserName = (user: UserProfile) => {
        if (displayNameSettings === 'full_name') {
            return user.first_name + ' ' + user.last_name;
        }
        if (displayNameSettings === 'username') {
            return user.username;
        }

        if (displayNameSettings === 'nickname_full_name') {
            if (user.nickname !== '') {
                return user.nickname;
            }
            return user.first_name + ' ' + user.last_name;
        }
    };

    const repeatOnSelect = (event: SelectionEvents, data: OptionOnSelectData) => {
        if (data.optionValue === 'custom') {
            setRepeatOption('Custom');
            setShowCustomRepeat(true);
            setRepeatOptionsSelected(['custom']);
        } else {
            setRepeatOption("Don't repeat");
            setShowCustomRepeat(false);
            setRepeatOptionsSelected(['empty']);
        }
    };

    const AddedUserComponent = (props: AddedUserComponentProps) => {
        let stat = 'unknown';
        if (UserStatusSelector[props.user.id] === 'online') {
            stat = 'available';
        }

        return (<span className='added-user-badge-container'>
            <Persona
                name={getDisplayUserName(props.user)}
                avatar={{ color: 'colorful' }}
                presence={{ status: stat }}
            />
            <Dismiss12Regular
                className='added-user-badge-icon-container'
                onClick={() => {
                    dispatch(updateMembersAddedInEvent(usersAddedInEvent.filter((item: UserProfile) => item.id !== props.user.id)));
                }}
            />

        </span>);
    };

    const UsersAddedComponent = () => {
        if (usersAddedInEvent.length > 0) {
            return (<div className='added-users-list'>
                {
                    usersAddedInEvent.map((user: UserProfile) => {
                        return <AddedUserComponent user={user} />;
                    })
                }
            </div>);
        }
        return <></>;
    };

    const RemoveEventButton = () => {
        if (selectedEvent?.event?.id != null) {
            return (<DialogActions position='star'>
                <Button
                    appearance='outline'
                    icon={<Delete16Regular />}
                    onClick={onRemoveEvent}
                >
                    {'Remove'}
                </Button>
            </DialogActions>);
        }
        return <></>;
    };

    const RepeatComponent = () => {
        if (showCustomRepeat) {
            return (
                <RepeatEventCustom
                    selected={repeatRule}
                    onSelect={setRepeatRule}
                />
            );
        }
        return <></>;
    };

    const onToggleInterested = async () => {
        if (!selectedEvent?.event?.id) return;
        const res = await fetch(`/plugins/calendar/events/${selectedEvent.event.id}/interested`, { method: 'POST', credentials: 'same-origin' });
        const data = await res.json();
        if (data && typeof data.data?.interested === 'boolean') {
            setIsInterested(data.data.interested);
        }
    };

    // Render accepted users' avatars
    const renderAcceptedAvatars = () => {
        if (!acceptedUsers || acceptedUsers.length === 0) {
            return null;
        }
        return (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                {acceptedUsers.map(user => (
                    <img
                        key={user.id}
                        src={Client4.getProfilePictureUrl(user.id)}
                        alt={getDisplayUserName(user)}
                        title={getDisplayUserName(user)}
                        style={{ width: 32, height: 32, borderRadius: '50%' }}
                    />
                ))}
            </div>
        );
    };

    const handleNotificationChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        setNotificationSetting(value);
        setNotificationSaving(true);
        if (selectedEvent?.event?.id) {
            await ApiClient.setNotificationSetting(selectedEvent.event.id, value);
        }
        setNotificationSaving(false);
    };

    return (
        <div>
            {
                usersAddedInEvent.length > 0 ? <PlanningAssistant
                    open={isPlanningAssistantOpen}
                    onOpenChange={(ev, data) => {
                        setIsPlanningAssistantOpen(data.open);
                        inputEventTitleRef.current.focus();
                    }}
                /> : null
            }
            <Dialog open={isOpenEventModal}>
                <DialogSurface>
                    <DialogBody className='event-modal'>
                        <DialogTitle className='event-modal-title' />
                        <DialogContent className='modal-container'>
                            <div className='event-color-button'>
                                <Combobox
                                    onOptionSelect={onSelectColor}
                                    className={`dropdown-color-button ${selectedColorStyle}`}
                                    style={{ color: selectedColor, borderColor: 'unset' }}
                                    defaultSelectedOptions={['default']}
                                    expandIcon={<Circle20Filled className={selectedColorStyle} />}
                                    width='50px'
                                    listbox={{
                                        className: 'dropdown-color-button-listbox',
                                    }}
                                >
                                    <Option
                                        key='default'
                                        text='default'
                                        className='event-color-items event-color-default'
                                    >
                                        <i className='icon fa fa-circle' />
                                    </Option>
                                    <Option
                                        key='default'
                                        text='#F2B3B3'
                                        className='event-color-items event-color-red'
                                    >
                                        <i className='icon fa fa-circle' />
                                    </Option>
                                    <Option
                                        key='default'
                                        text='#FCECBE'
                                        className='event-color-items event-color-yellow'
                                    >
                                        <i className='icon fa fa-circle' />
                                    </Option>
                                    <Option
                                        key='default'
                                        text='#B6D9C7'
                                        className='event-color-items event-color-green'
                                    >
                                        <i className='icon fa fa-circle' />
                                    </Option>
                                    <Option
                                        key='default'
                                        text='#B3E1F7'
                                        className='event-color-items event-color-blue'
                                    >
                                        <i className='icon fa fa-circle' />
                                    </Option>
                                </Combobox>
                            </div>
                            <div className='title-toolbar'>
                                <Toolbar aria-label='Default'>
                                    <ToolbarButton
                                        aria-label='planning assistant'
                                        onClick={() => setIsPlanningAssistantOpen(true)}
                                        disabled={usersAddedInEvent.length === 0}
                                    >
                                        planning assistant
                                    </ToolbarButton>
                                </Toolbar>
                            </div>
                            <div className='event-title-container'>
                                <Pen24Regular />
                                <div className='event-input-container'>
                                    {isLoading ? (<Skeleton className='event-input-title'>
                                        <SkeletonItem />
                                    </Skeleton>) : (<Input
                                        ref={inputEventTitleRef}
                                        type='text'
                                        className='event-input-title'
                                        size='large'
                                        appearance='underline'
                                        placeholder='Add a title'
                                        value={titleEvent}
                                        onChange={onTitleChange}
                                    />)}

                                </div>
                            </div>
                            <div className='datetime-container'>
                                <Clock24Regular />
                                <div className='event-input-container-datetime event-input-container'>
                                    <div className='datetime-group'>
                                        {isLoading ? (<Skeleton className='start-date-input'>
                                            <SkeletonItem />
                                        </Skeleton>) : (<Input
                                            type='date'
                                            className='start-date-input'
                                            value={format(selectedEventTime?.start, 'yyyy-MM-dd')}
                                            onChange={onStartDateChange}
                                        />)}

                                        {isLoading ? (<Skeleton className='start-date-input'>
                                            <SkeletonItem />
                                        </Skeleton>) : (<TimeSelector
                                            selected={selectedEventTime.startTime}
                                            onSelect={(value) => dispatch(updateSelectedEventTime({ startTime: value }))}
                                        />)}

                                    </div>
                                    <div className='datetime-group datetime-group-end'>
                                        {isLoading ? (
                                            <Skeleton className='end-date-input'>
                                                <SkeletonItem />
                                            </Skeleton>
                                        ) :
                                            (<Input
                                                type='date'
                                                className='end-date-input'
                                                value={format(selectedEventTime?.end, 'yyyy-MM-dd')}
                                                onChange={onEndDateChange}
                                            />)}
                                        {isLoading ? (<Skeleton className='end-date-input'>
                                            <SkeletonItem />
                                        </Skeleton>) : (<TimeSelector
                                            selected={selectedEventTime.endTime}
                                            onSelect={(value) => dispatch(updateSelectedEventTime({ endTime: value }))}
                                        />)}

                                    </div>

                                </div>
                            </div>
                            <div className='repeat-container'>
                                {isLoading ? (<Skeleton className='skeleton-dropdown'>
                                    <SkeletonItem />
                                </Skeleton>) :
                                    (
                                        <Combobox
                                            onOptionSelect={repeatOnSelect}
                                            selectedOptions={repeatOptionsSelected}
                                            value={repeatOption}
                                        >
                                            <Option
                                                key='empty'
                                                text='empty'
                                            >
                                                Don't repeat
                                            </Option>
                                            <Option
                                                key='custom'
                                                text='custom'
                                            >
                                                Custom
                                            </Option>
                                        </Combobox>
                                    )}
                                <RepeatComponent />
                            </div>

                            <div className='event-channel-container'>
                                <ChatMultiple24Regular />
                                <div className='event-channel-input-container'>
                                    <div className='event-input-channel-wrapper'>
                                        {isLoading ? (
                                            <Skeleton className='skeleton-dropdown'>
                                                <SkeletonItem />
                                            </Skeleton>
                                        ) : (
                                            <Combobox
                                                placeholder='Select a channel'
                                                onChange={onInputChannelAction}
                                                onOptionSelect={onSelectChannelOption}
                                                value={selectedChannelText}
                                            >
                                                {channelsAutocomplete.map((option) => (
                                                    <Option
                                                        key={option.id}
                                                        text={option.id}
                                                    >
                                                        {option.display_name}
                                                    </Option>
                                                ))}

                                                {channelsAutocomplete.length === 0 ? (
                                                    <Option
                                                        key='no-results'
                                                        text=''
                                                    >
                                                        No results found
                                                    </Option>
                                                ) : null}
                                            </Combobox>
                                        )}
                                    </div>
                                </div>
                                <div className="current-team-tag">
                                <Tag icon={<PeopleTeam24Regular />}>{CurrentTeam.display_name}</Tag>
                                </div>
                            </div>

                            {
                                isLoading ?
                                    <Skeleton className='skeleton-dropdown'>
                                        <SkeletonItem />
                                    </Skeleton>
                                    :
                                    <VisibilitySelect
                                        selected={selectedVisibility}
                                        onSelected={(selected) => setSelectedVisibility(selected)}
                                    />
                            }

                            {
                                isLoading ?
                                    <Skeleton className='skeleton-dropdown'>
                                        <SkeletonItem />
                                    </Skeleton>
                                    :
                                    <EventAlertSelect
                                        selected={selectedAlert}
                                        onSelected={(selected) => setSelectedAlert(selected)}
                                    />
                            }

                            <div className='notification-setting-container' style={{ margin: '12px 0' }}>
                                <label htmlFor='notification-setting-select'>Notification preference:</label>
                                <select
                                    id='notification-setting-select'
                                    value={notificationSetting}
                                    onChange={handleNotificationChange}
                                    disabled={notificationSaving || isLoading}
                                    style={{ marginLeft: 8 }}
                                >
                                    {notificationOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className='event-add-users-container'>
                                <PersonAdd24Regular />
                                <div className='event-input-container'>
                                    <div className='event-input-users-wrapper'>
                                        {isLoading ? (<Skeleton className='skeleton-dropdown'>
                                            <SkeletonItem />
                                        </Skeleton>) : (<Combobox
                                            placeholder='Select a user'
                                            checked={false}
                                            selectedOptions={[]}
                                            onChange={onInputUserAction}
                                            onOptionSelect={(event, data) => {
                                                if (data.optionValue in usersMentionTags) {
                                                    dispatch(updateMembersAddedInEvent(profilesInChannel));
                                                }
                                                usersAutocomplete.map((user) => {
                                                    if (user.id === data.optionValue && !usersAddedInEvent.some((u) => u.id === data.optionValue)) {
                                                        dispatch(updateMembersAddedInEvent([...usersAddedInEvent, user]));
                                                    }
                                                });
                                                setSearchUsersInput('');
                                                setUsersAutocomplete([]);
                                            }}
                                            value={searchUsersInput}
                                        >
                                            <OptionGroup label='USERS'>

                                                {usersAutocomplete.map((user) => {
                                                    let stat = 'unknown';
                                                    if (UserStatusSelector[user.id] === 'online') {
                                                        stat = 'available';
                                                    }
                                                    return (<Option text={user.id}>
                                                        <Persona
                                                            name={getDisplayUserName(user)}
                                                            className='user-list-item'
                                                            as='div'
                                                            presence={{ status: stat }}
                                                        />
                                                    </Option>);
                                                })}

                                                {usersAutocomplete.length === 0 ? (
                                                    <Option
                                                        key='no-results'
                                                        text=''
                                                    >
                                                        No results found
                                                    </Option>
                                                ) : null}
                                            </OptionGroup>
                                            <OptionGroup label='SPECIAL'>
                                                {
                                                    Object.entries(usersMentionTags).map(([key, value]) => {
                                                        return (<Option
                                                            key={key}
                                                            text={key}
                                                        >
                                                            {value}
                                                        </Option>);
                                                    })
                                                }
                                            </OptionGroup>
                                        </Combobox>)}

                                    </div>
                                </div>
                            </div>
                            <div className='users-added-container'>
                                <UsersAddedComponent />
                            </div>

                            <div className='event-description-container'>
                                <TextDescription24Regular />
                                <div className='event-description-input-container'>
                                    {isLoading ? (<Skeleton className='event-description-input-textarea'><SkeletonItem /></Skeleton>) :
                                        <Textarea
                                            placeholder='Add description'
                                            className='event-description-input-textarea'
                                            resize='vertical'
                                            value={descriptionEvent}
                                            onChange={(event, data) => setDescriptionEvent(data.value)}
                                        />}
                                </div>

                            </div>
                            {renderAcceptedAvatars()}
                            <Toaster toasterId={toasterId} />
                        </DialogContent>
                        <RemoveEventButton />
                        <DialogActions position='end'>
                            <Button
                                appearance={isInterested ? 'primary' : 'secondary'}
                                onClick={onToggleInterested}
                                style={{ marginRight: '8px' }}
                            >
                                {isInterested ? 'Interested ✓' : 'Interested'}
                            </Button>
                            <DialogTrigger disableButtonEnhancement={true}>
                                <Button
                                    appearance='secondary'
                                    onClick={viewEventModalHandleClose}
                                >
                                    {'Close'}
                                </Button>
                            </DialogTrigger>
                            <Button
                                appearance='primary'
                                onClick={onSaveEvent}
                                icon={isSaving ? (<Spinner size='tiny' />) : (<Save16Regular />)}
                                disabled={isSaving || !canEdit}
                            >
                                {'Save'}
                            </Button>
                        </DialogActions>
                    </DialogBody>
                </DialogSurface>
            </Dialog>
        </div>

    );
};

export default EventModalComponent;