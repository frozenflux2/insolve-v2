const { io, manager } = require('../classes/IO_Manager')();
const events = require('../interfaces/events');
const users = require('../interfaces/users');
const botManager = require('../interfaces/bots');
const database = require('../interfaces/database');
const steamPrices = require('../interfaces/steam');
const transactions = require('../interfaces/transactions');
const tradeManager = require('steam-tradeoffer-manager');
const { sum } = require('../helpers');
const { TF2_CoinflipValidator } = require('../handlers/tf2_coinflip');
const { TF2_MinesValidator } = require('../handlers/tf2_mines');

const { steamTrades } = require('../config');

const botsForGames = {
  'jackpot': 0,
  'coinflip': 1
}

const validators = {
  coinflip: TF2_CoinflipValidator,
  mines: TF2_MinesValidator
}

const validateItems = async list => {
  // todo: check for duplicates here (important! can be a infinite money exploit)
  list = [...new Set(list)];
  
  const assetids = list.map(item => item.assetid);
  const items_db = await database.get('steam_items', {filter: assetids, filter_key: 'assetid'});
  let items = items_db.map(item => {
    item.amount = parseInt((list.filter(it => it.assetid == item.assetid)[0] || {amount: 1}).amount);

    return {
      amount: item.amount,
      appid: item.appid,
      assetid: item.assetid,
      classid: item.classid,
      contextid: item.contextid,
      name: item.name,
      price: item.price,
      image: item.image,
      color: item.color,
      tf2_itemSKU: item.tf2_itemSKU || ''
    };
  });

  items = items.filter(x => !isNaN(x.price) && !!x.price);
  let itemsWithPrices = await steamPrices.attachPrices(items); // todo: remove * 1 ?
  itemsWithPrices = itemsWithPrices.filter(x => !isNaN(x.price) && !!x.price);
  let price = itemsWithPrices.reduce((a, b) => +a + (+(b.price || 0) * b.amount), 0);

  return {
    items,
    itemsWithPrices,
    price
  };
}

/**
 * New steam deposit
 */
 events.on('transactions:new-deposit-steam', async ({ num_id, code, data, user }) => {
  const { items, itemsWithPrices, price } = await validateItems(data.items);
  user = users.find(user, 'id');


  // debug debug deub
  // setTimeout(async () => await transactions.update(num_id, 1, {bot: '765', offerid: 987654}), 2000);
  // return;
  // end debug
  // console.log('transactions:new-deposit-steam', data?.extra_data);

  // validate
  try {
    if(!user) throw `Invalid user session. Please re-login and try again.`;
    if(!!user.get('banned')) throw user.getBanMsg();
    if(botManager.getOnlineBots().length == 0) throw `No online bots to process your request right now. Please try again later.`;
    if(!steamTrades.allowedGames.includes(data?.extra_data?.game)) throw `Invalid game`;
    if(data.items.length > items.length) throw 'Invalid item list (items missing from database)';
    if(price < steamTrades.minDepositValue) throw `Deposits must be atleast $${steamTrades.minDepositValue}. Please add more items and try again.`;
    if(steamTrades.maxDepositValue !== 0 && price > steamTrades.maxDepositValue) throw `Deposits must be below $${steamTrades.maxDepositValue}. Please remoev some items and try again.`;
    if(items.length > steamTrades.maxItemsPerTrade) throw `Maximum of ${steamTrades.maxItemsPerTrade} items per trade are accepted.`;
  
    // gamemode validation
    if(validators[data?.extra_data?.game]) {
      await validators[data?.extra_data?.game]({ data, user, items: itemsWithPrices, price });
    }
  } catch(e) {
    // console.log('validation failed', e);
    return transactions.update(num_id, 3, {items: itemsWithPrices, price, error_reason: e.message || e});
  }

  console.log(`[Transactions] User "${user.get('name')}" requested a new Steam deposit, containing ${items.length} items worth a total of $${price}`);

  // update database
  await transactions.update(num_id, 1, {items: itemsWithPrices, price});

  // send the offer
  // const bot = botManager.getRandomBot(); // todo: use this instead of index
  const bot = botManager.getByIndex(botsForGames[data?.extra_data?.data?.game] || 0);

  bot.sendOffer({type: 'deposit', user, items, code}).then(async offerId => {
    events.emit('steam:deposit-started', {user, data: {...data, items: itemsWithPrices, price}, tx_id: num_id});

    await transactions.update(num_id, 1, {bot: bot.data.steamid, offerid: offerId, code});
  }).catch(async e => {
    // todo: try to make it so the previous try/catch can catch errors from here too
    // todo: tidy up the messages to be more user friendly (specifically steam-sent errors)
    await transactions.update(num_id, 3, {error_reason: e.message || e});
  });
});



/**
 * New steam winnings (from jackpot or coinflip)
 */
events.on('transactions:new-winnings-steam', async ({ num_id, code, data, user, callback }) => {
  // console.log('callback', callback);
  user = users.find(user, 'id');

  const price = sum(data?.items || [], 'price');
  const items = data?.items || [];

  // validate
  /*
  try {
    if(!!user.get('banned')) throw user.getBanMsg();
    if(botManager.getOnlineBots().length == 0) throw `No online bots to process your request right now. Please try again later.`;
    if(!steamTrades.allowedGames.includes(data?.extra_data?.data?.game)) throw `Invalid game`;
    if(data.items.length > items.length) throw 'Invalid item list (items missing from database)';
    if(price < steamTrades.minDepositValue) throw `Deposits must be atleast $${steamTrades.minDepositValue}`;
    if(steamTrades.maxDepositValue !== 0 && price > steamTrades.maxDepositValue) throw `Deposits must be below $${steamTrades.maxDepositValue}`;
    // todo: validate item amount (max 20)
  } catch(e) {
    console.log('validation failed', e);
    return transactions.update(num_id, 3, {items: itemsWithPrices, price, error_reason: e.message || e});
  }
  */

  console.log(`[Transactions] Sending a winning offer to "${user.get('name')}" (${user.get('steamid')}), containing ${items.length} items worth a total of $${parseFloat(price).toFixed(2)} (${data?.extra_data?.why})`);

  // update database
  // await transactions.update(num_id, 1, {items: itemsWithPrices, price});

  // send the offer
  // const bot = botManager.getRandomBot(); // todo: use this instead of index
  const bot = botManager.getByIndex(botsForGames[data?.extra_data?.data?.game] || 0);

  bot.sendOffer({type: 'withdraw', user, items, code, message: `You won a total of $${parseFloat(price).toFixed(2)} on TF2Double. Congratulations!`}).then(async offerId => {
    console.log(`[Transactions] Winning offer to "${user.get('name')}" (${user.get('steamid')}) has been sent successfully! Offer id is #${offerId}, event is "${`${data?.extra_data?.why}:winnings-sent`}"`);
    manager.emit(`${data?.extra_data?.why}:winnings-sent`, offerId, user.getSids());
    await transactions.update(num_id, 1, {bot: bot.data.steamid, offerid: offerId, value: price});

    if(callback && typeof callback == 'function') callback({err: null, offerId});
  }).catch(async e => {
    // todo: should update the databse entry in coinflip_games too
    console.log(`[Transactions] Failed to send the winning offer to "${user.get('name')}" (${user.get('steamid')})! Event is "${`${data?.extra_data?.why}:winnings-sent-error`}", error is: `, e);
    manager.emit(`${data?.extra_data?.why}:winnings-sent-error`, e?.message || e, user.getSids());
    await transactions.update(num_id, 3, {error_reason: e?.message || e, value: price});

    if(callback && typeof callback == 'function') callback({err: e?.message});
  });
});


/**
 * New steam refund (game has been cancelled by player)
 */
const MAP_GAME = {
  'coinflip-refund': 'coinflip',
  'mines-refund': 'mines'
};

events.on('transactions:new-refund-steam', async (d) => {
  let { num_id, code, data, extra_data, user, callback } = d;

  user = users.find(user, 'id');
  const price = sum(data?.items || [], 'price');
  const items = data?.items || [];
  const game = MAP_GAME[extra_data?.why || data?.extra_data?.why];

  // todo: items should be sent to game creator not the admin who cancelled

  console.log(`[Transactions] Sending a refund offer to "${user.get('name')}" (${user.get('steamid')}), containing ${items.length} items worth a total of $${parseFloat(price).toFixed(2)} (${data?.extra_data?.why})`);

  // update database
  // await transactions.update(num_id, 1, {items: itemsWithPrices, price});

  // send the offer
  // const bot = botManager.getRandomBot(); // todo: use this instead of index
  const bot = botManager.getByIndex(botsForGames[game] || 0);

  bot.sendOffer({type: 'withdraw', user, items, code, message: `This is a refund for your cancelled ${game} game`}).then(async offerId => {
    await transactions.update(num_id, 1, {bot: bot.data.steamid, offerid: offerId, value: price});

    if(callback && typeof callback == 'function') callback({err: null, offerId, id: extra_data?.roundId});
  }).catch(async e => {
    console.log(`[Transactions] Failed to send refund offer to "${user.get('name')}" (${user.get('steamid')})!`, e);
    await transactions.update(num_id, 3, {error_reason: e?.message || e, value: price});

    if(callback && typeof callback == 'function') callback({err: e?.message, id: extra_data?.roundId});
  });
});



/**
 * New steam withdraw
*/
events.on('transactions:new-withdraw-steam', async ({ num_id, code, data, user }) => {
  user = users.find(user, 'id');
  const { items, itemsWithPrices, price } = await validateItems(data.items);
  const bal = user.get('balance');
  
  // validate
  try {
    throw `Withdrawals are temporarily disabled.`;
    return;

    if(!!user.get('banned')) throw user.getBanMsg();
    if(data.items.length > items.length) throw 'Invalid item list (items missing from database)';
    if(price < steamTrades.minWithdrawValue && steamTrades.minWithdrawValue !== 0) throw `Withdrawals must be atleast $${steamTrades.minWithdrawValue}`;
    if(steamTrades.maxWithdrawValue !== 0 && price > steamTrades.maxWithdrawValue) throw `Withdrawals must be below $${steamTrades.maxWithdrawValue}`;
    if(price > bal || (bal - price) < 0) throw `Not enough balance`;
    if(botManager.getOnlineBots().length == 0) throw `No online bots to process your request right now. Please try again later.`;
    // big todo: move deposit and withdraw logic into one place
    // todo: validate appids
    // todo: add a limit on active transactions!
    // todo: validate item amount (max 20)
    // important todo! make sure there are no duplicates in the array as this increases the price
  } catch(e) {
    return transactions.update(num_id, 3, {items: itemsWithPrices, price, error_reason: e});
  }

  console.log(`[Transactions] New Steam withdraw from "${user.get('name')}", containing ${items.length} items worth a total of $${price}`);

  // update database
  await user.updateBalance(price, 'remove');
  await transactions.update(num_id, 1, {items: itemsWithPrices, price});

  // send the offer
  // big todo: here we will loop through all items, decide to which bot send all of them and send offer from that bot
  const bot = botManager.getRandomBot();

  bot.sendOffer({type: 'withdraw', user, items, code}).then(async offerId => {
    await transactions.update(num_id, 1, {bot: bot.data.steamid, offerid: offerId});
  }).catch(async e => {
    await transactions.update(num_id, 3, {error_reason: e.message || e});
  });
});



events.on('steam:sentOfferChanged', async ({ offer, oldState }) => {
  console.log(`[Steam] Offer #${offer.id} changed state from ${tradeManager.ETradeOfferState[oldState] || oldState} to ${tradeManager.ETradeOfferState[offer.state] || offer.state}`);

  // find offer in database
  const dbOffer = await database.get('transactions', {filter: {extra_data: {offerid: offer.id}}});
  if(dbOffer.length == 0) return console.log('Offer unknown to us');

  // find related user
  const user = users.find(dbOffer[0].user, 'id');
  if(!user) return console.log('User unknown');
  // todo: write a custom log() function will only log in debug mode and take a condition as paramter
  /*
    log('User unknown to us', {
      condition: !user,
      priority: 1
    })
  */

  // actions
  if(offer.state == 3) { // accepted
    await transactions.update(dbOffer[0].num_id, 2);

    if(dbOffer[0].type == 'deposit-steam') {
      // todo: use proper seperation of concerns - balance update should be handled in a subscriber elsewhere
      offer.getExchangeDetails((err, status, tradeInitTime, receivedItems) => {
        if(err) console.log('failed to get received items', err);
        
        if(!err) {
          const receivedItemsNew = dbOffer[0].extra_data.items.map(item => {
            // todo: remove all extra data from items except app_data
            // switch dbOffer[0].extra_data.items and receivedItems
            const matchingItem = receivedItems.filter(it => it.assetid == item.assetid)[0]; // todo: might have to filter by something else than name

            item.assetid = matchingItem.new_assetid;
            item.contextid = matchingItem.new_contextid;
            item.app_data = matchingItem.app_data || {};
            return item;

          });

          events.emit('steam:deposit-complete', {user, data: {...dbOffer[0], extra_data: {...dbOffer[0].extra_data, items: receivedItemsNew}}});
          transactions.update(dbOffer[0].num_id, 2, {items: receivedItemsNew});
        } else {
          events.emit('steam:deposit-complete', {user, data: dbOffer[0]});
        }


        user.updateBalance(dbOffer[0].extra_data.price, 'add');
        
      });
    }
  } else {
    if(![4, 6, 7, 8, 10, 11].includes(offer.state)) return;
    if(offer.state == 4 || offer.state == 11) offer.cancel();

    await transactions.update(dbOffer[0].num_id, 3, {error_reason: offer.state == 4 ? 'Counter offers aren\'t allowed.' : (offer.state == 11 ? 'Escrow trades aren\'t allowed.' : `Offer cancelled by user or items no longer available.`)});
    
    if(dbOffer[0].type == 'withdraw-steam') { // refund user
      user.updateBalance(dbOffer[0].extra_data.price, 'add');
    } else if(dbOffer[0].type == 'deposit-steam') {
      events.emit('steam:deposit-failed', {user, data: dbOffer[0]});
    }
  }
});

module.exports = {
  botsForGames
};