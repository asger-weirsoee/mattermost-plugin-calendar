# Todo

- [x] Update the model to store who has created the calendar event. (Already implemented, but ensure the frontend always sets the current user as owner on creation.)

- [x] Only allow the creator of the calendar event (and team/system admins - based on Mattermost) to edit an existing calendar event.
    - [x] Add backend permission checks to only allow the event owner or a team/system admin to edit an event.
    - [x] Update the frontend to hide or disable edit options for users who are not the owner or an admin.

- [x] Users should be able to press "interested" in the calendar event, and they should receive notifications based on the settings in the calendar event.
    - [x] Add a way for users to mark themselves as "interested" in an event (new field in `calendar_members`).
    - [x] Update the backend to handle "interested" status.
    - [x] Add UI in the frontend for users to press "interested" on an event.

- [ ] Allow users to configure notification settings per event or per interest.
    - [ ] Update the DB schema to add a `notification_setting` column to `calendar_members` (string, e.g., '5_minutes_before').
    - [ ] Update backend models and migrations for the new column.
    - [ ] Add backend API endpoints to set/get a user's notification setting for an event.
    - [ ] Add frontend UI for users to select their notification preference per event.
    - [ ] Update notification logic to use the user's setting if present, otherwise fall back to the event's default alert.
    - [ ] (Finding) This expands the scope to require a migration and new API endpoints, as well as UI/UX for notification preferences. 