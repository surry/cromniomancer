'use strict';

var RtmClient = require('@slack/client').RtmClient;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var schedule = require('node-schedule');

const https = require('https');

var {util} = require('./app');

const botToken = process.env.SLACK_BOT_TOKEN || '';
const darkskyToken = process.env.DARKSKY_TOKEN || '';

if (!botToken || !darkskyToken) {
    console.error('SLACK_BOT_TOKEN and DARKSKY_TOKEN must be passed as environment variables!');
    process.exit(1);
}

var rtm = new RtmClient(botToken);

let botID;

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
    // looks like self.id should always be present - https://api.slack.com/methods/rtm.start
    botID = rtmStartData.self.id.toLowerCase();
    console.log(`Logged in as ${rtmStartData.self.name}(${botID}) of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

let channel;
let rtmConnectionOpened = false;

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {

    //XXX use general channel
    if (!channel) {
        channel = message.channel;
    }

    // forgive trailing spaces and ignore case
    const normalizedMessage = message.text.trim().toLowerCase();
    let now = false;
    let tomorrow = false;

    // only respond to messages where we're mentioned
    if (normalizedMessage.indexOf(`<@${botID}>`) === -1) {
        return;
    }

    if (normalizedMessage.indexOf('weather now') !== -1) {
        now = true;
    }

    if (normalizedMessage.indexOf('weather tomorrow') !== -1) {
        tomorrow = true;
    }

    if (!now && !tomorrow) {
        if (rtmConnectionOpened) {
            if (normalizedMessage.indexOf('help') !== -1) {
                rtm.sendMessage(`<@${message.user}>, try @surry-interview 'weather now' or 'weather tomorrow'`, channel);
            } else {
                rtm.sendMessage(`<@${message.user}>, I did not understand that command, try @surry-interview 'weather now' or 'weather tomorrow'`, channel);
                console.log('Ignoring unknown command: ' + normalizedMessage.substring(0, 20) + '...');
            }
        }
        return;
    }

    if (now) {
        util.getCurrentWeatherReport().then((json) => {
            if (rtmConnectionOpened) {
                if (json.currently) {
                    let message = util.generateCurrentSummary(json.currently);
                    rtm.sendMessage(message, channel);
                }
            }
        }).catch((error) => {
            console.error(error);
        });
    }

    if (tomorrow) {
        util.getTomorrowsWeatherReport().then((json) => {
            if (rtmConnectionOpened) {
                if (json.daily.data.length >= 1) {
                    let message = util.generateTomorrowsSummary(json.daily.data[0]);
                    rtm.sendMessage(message, channel);
                } else {
                    rtm.sendMessage('There is no forecast for tomorrow! The end is nigh.', channel);
                }
            }

        }).catch((error) => {
            console.log(error);
        });
    }
});

let dailyAnnounceJob;
let currentWeatherIcon;

util.getCurrentWeatherReport().then((json) => {
    currentWeatherIcon = json.currently.icon;
}).catch((error) => {
    console.error(`Couldn't fetch the current forecast from darksky!`);
});

rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
    // need to wait for the client to fully connect before we can send messages
    rtmConnectionOpened = true;

    let rule = new schedule.RecurrenceRule();
    rule.hour = 9;
    dailyAnnounceJob = schedule.scheduleJob(rule, () => {
        console.log(`Checking if today's forecast is different from yesterday's...`);
        util.getCurrentWeatherReport().then((json) => {
            if (json.currently.icon != currentWeatherIcon) {
                if (rtmConnectionOpened) {
                    let message = 'Hey everybody, it looks like there is a change in weather from yesterday.\n'
                    message += util.generateCurrentReport(json.currently);
                    rtm.sendMessage(message, channel);
                }
            }
            currentWeatherIcon = json.currently.icon;
        });
    });
});

rtm.start();

process.on('SIGINT', (code) => {
    console.log('Disconnecting RTM client...');
    rtmConnectionOpened = false;
    dailyAnnounceJob.cancel();
    rtm.disconnect();
});
