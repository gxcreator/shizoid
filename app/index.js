require('dotenv').config();

const Telegraf = require('telegraf');
const { config } = require('../config/config.js');
const models = require('../models');
const forgetMiddleware = require('./middlewares/forgetMiddleware.js');
const setupCommands = require('./commands/index.js');
const { MessageProcessor, setupMessageProcessor } = require('./helpers/messageProcessor.js');
const { result } = require('lodash');

const bot = new Telegraf(config.token);

bot.use(async (_, next) => {
    try {
        await next();
    } catch (e) {
        console.log('uncaught', e);
    }
})
bot.use(forgetMiddleware);

setupCommands(bot);
setupMessageProcessor(bot);

const init = async () => {
    await models.sequelize.sync();
    console.log('DB init');

    bot.launch();

    let exportFileName = "result.json";
    console.log("learn " + exportFileName);
    const fsPromises = require('fs').promises;
    var obj;

    //fs.readFile(exportFileName, 'utf8', function (err, data) {

    const data = await fsPromises.readFile(exportFileName, 'utf8')
        .catch((err) => console.error('Failed to read file', err));

    obj = JSON.parse(data);
    console.log("JSON parsed");
    chatId = obj.id;
    console.log(`chat id: ${chatId}; count: ${obj.messages.length}`);

    //obj.messages.forEach((msg) => {
    for (const msg of obj.messages) {
        //console.log(msg)
        try {
            msg.chatId = chatId;
            if (Array.isArray(msg.text)) {
                let text = "";
                msg.text.forEach((textObj) => {
                    if (typeof textObj === 'string') {
                        text += textObj;
                    }
                });
                msg.text = text;
            }
            msg.chat = { id: chatId };
            let ctx = { message: msg };
            let mp = new MessageProcessor(ctx);
            console.log(`[${msg.id}] ${msg.text}`);
            await mp.process();
        } catch (e) {
            console.dir(msg);
            console.log(e);
        }
    }
}

process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
process.on('uncaughtException', exitHandler);

function exitHandler() {
    models.sequelize.close();
    process.exit(0);
}

init();