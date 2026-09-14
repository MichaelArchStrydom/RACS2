//Stores Notification text

export const NEW_COVER_REQUEST_NOTIFICATION = {
  title: 'New cover request',
  body: '',
  url: '/',

}

export const ADMIN_TEST_BROADCAST_NOTIFICATION = {
  title: 'test broadcast',
  body: `Sent by: `,
  url: '/',
}

export const USER_TEST_BROADCAST_NOTIFICATION = {
  title: 'test broadcast',
  body: `Sent by: `,
  url: '/profile',
}

export const USER_COVER_ACCEPTED = {
  title: 'Your cover request was picked up',
  body: '',
  url: '/',
}

export const USER_NO_COVER_NOTIFICATION_24H = {
  title: 'Still no cover for your shift',
  body: ` shift starts within 24 hours and still has no cover.`,
  url: '/',
}

export const USER_NO_COVER_NOTIFICATION_1H = {
  title: 'Your Shift Needs Cover',
  body: ` shift starts in about an hour and still has no cover.`,
  url: '/',
}

export const COVER_NEEDED_NOTIFICATION = {
  title: 'ShortCrew Warning',
  body: ` unclaimed shift is coming up`,
  url: '/',
}
