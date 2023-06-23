const events = require('../interfaces/events');
const { now } = require('../helpers');
const database = require('../interfaces/database');

events.on('chat:message', async ({ room, content, user }) => {
  // console.log('/subscribers/chat.js received a a chat message');
  // console.log(`${user.name} said "${content}" in ${room.id}`);

  if(!user) user = {system: true};
  if(!user.badge) user.badge = ''; // todo: fix if badge is empty it will crash
  if(!user.badge_color) user.badge_color = '';
  if(!user.badge_text_color) user.badge_text_color = '';

  database.insert('chat_messages', {
      room: room.id,
      content,
      user,
      time: now() // todo: use the time from arguments
  });
});

events.on('chat:deleteMessage', async ({ steamid, content, time, room }) => {
  // todo: this is fucked, this should obviously be using ids and not all these params 
  database.remove('chat_messages', {
    filter: {
      user: {steamid},
      time,
      // content,
      room
    }
  });
});