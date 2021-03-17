const { config } = require('../config/config.js');
const _ = require('lodash');

module.exports = function (sequelize) {
    let Pair = sequelize.define(
        'Pair',
        {},
        {
            indexes: [
                {
                    fields: ['ChatId', 'firstId', 'secondId'],
                },
                {
                    fields: ['ChatId'],
                },
            ],
            classMethods: {
                associate: function (models) {
                    Pair.belongsTo(models.Chat);
                    Pair.belongsTo(models.Word, { as: 'first' });
                    Pair.belongsTo(models.Word, { as: 'second' });
                    Pair.hasMany(models.Reply);
                },
                learn: async function (message) {
                    let self = this;
                    let Word = sequelize.import('./word');
                    let Reply = sequelize.import('./reply');
                    let response = await Word.learn(message.words);
                    let chatId = message.chatId ? message.chatId : message.chat.get('id');
                    let words = message.words.reduce(
                        (acc, word) => {
                            acc.push(response[word].get('id'));
                            if (config.punctuation.endSentence.includes(word[word.length - 1])) {
                                acc.push(null);
                            }

                            return acc;
                        },
                        [null],
                    );

                    if (words[words.length - 1] !== null) words.push(null);

                    while (_.size(words)) {
                        let [first, second, last] = _.take(words, 3);
                        
                        words.shift();
                        console.log(`F: ${first} S: ${second}`);
                        try {
                            let pair = (
                                await self.findOrCreate({
                                    where: {
                                        ChatId: chatId,
                                        firstId: first,
                                        secondId: second,
                                    },
                                    include: [{ model: Reply, all: true }],
                                })
                            )[0];

                            let reply = _.find(pair.Replies, function (reply) {
                                return reply.get('WordId') === last;
                            });

                            if (!reply) {
                                pair.createReply({
                                    PairId: pair.get('id'),
                                    WordId: last,
                                });
                            } else {
                                reply.increment('counter');
                            }
                        } catch (e) {
                            console.log("[message.id] "+ e);
                        }
                    }
                },
                getPair: async function (chatId, firstId, secondId) {
                    let self = this;
                    let pair = null;
                    pair = await self.findAll({
                        where: {
                            ChatId: chatId,
                            firstId: firstId,
                            secondId: secondId,
                        },
                        include: [
                            {
                                model: sequelize.import('./reply'),
                                all: true,
                                nested: true,
                                limit: 3,
                                separate: false,
                            },
                        ],
                        order: [[sequelize.import('./reply'), 'counter', 'DESC']],
                        limit: 3,
                    });

                    return _.sample(pair);
                },
                generate: async function (message) {
                    let self = this;
                    let Word = sequelize.import('./word');
                    let usingWords = _.difference(message.words, config.punctuation.endSentence.split(''));

                    //console.log(message);

                    let response = await Word.findAll({
                        where: {
                            word: usingWords,
                        },
                    });
                    let wordIds = _.map(response, function (result) {
                        return result.get('id');
                    });
                    let sentences = _.random(0, 3) + 1;
                    let result = [];

                    let generateSentence = async function (message) {
                        let sentence = '';
                        let safety_counter = 50;
                        let safeGetter = { get: () => null };
                        let firstWord = null;
                        let secondWord = wordIds;
                        let pair = await self.getPair(message.chat.get('id').toString(), firstWord, secondWord);
                        while (pair && safety_counter) {
                            safety_counter--;
                            let reply = _.sample(pair.Replies);
                            firstWord = (pair.get('second') || safeGetter).get('id');
                            secondWord = (reply.get('Word') || safeGetter).get('id');
                            if (!_.size(sentence)) {
                                sentence = _.capitalize((pair.get('second') || safeGetter).get('word') + ' ');
                                wordIds = _.difference(wordIds, [(pair.get('second') || safeGetter).get('id')]);
                            }

                            if (_.size((reply.get('Word') || safeGetter).get('word'))) {
                                sentence = sentence + reply.get('Word').get('word') + ' ';
                            } else {
                                break;
                            }
                            pair = await self.getPair(message.chat.id.toString(), firstWord, secondWord);
                        }

                        if (_.size(sentence)) {
                            sentence = _.trim(sentence);
                            if (_.indexOf(config.punctuation.endSentence, _.last(sentence)) < 0) {
                                sentence += _.sample(config.punctuation.endSentence.split(''));
                            }
                        }

                        return sentence;
                    };

                    for (let i = 0; i < sentences; i++) {
                        let tempSentence = await generateSentence(message);
                        result.push(tempSentence);
                    }

                    return result;
                },
            },
        },
    );
    return Pair;
};
