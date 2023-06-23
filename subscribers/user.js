const events = require('../interfaces/events');
const database = require('../interfaces/database');

events.on('signup', async data => {
  console.log('/subscribers/user.js received a signup event');
  console.log(data);
});

events.on('user:updateValue', async data => {
  let obj = {};
  obj[ data.key ] = data.value;

  await database.update('users', {filter: {id: data.id}}, obj);
});