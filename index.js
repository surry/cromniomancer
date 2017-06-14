'use strict';

var RtmClient = require('@slack/client').RtmClient;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var schedule = require('node-schedule');

var { util } = require('./app');


const botToken = process.env.SLACK_BOT_TOKEN || '';
const darkskyToken = process.env.DARKSKY_TOKEN || '';

if (!botToken || !darkskyToken) {
    console.error('SLACK_BOT_TOKEN and DARKSKY_TOKEN must be passed as environment variables!');
    process.exit(1);
}

var rtm = new RtmClient(botToken);

let botID;
let botChannel;

rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
    // XXX the private surry-channel doesn't show up in the rtmStartData even though my
    // bot was invited to the channel :(

    // looks like self.id should always be present - https://api.slack.com/methods/rtm.start
    botID = rtmStartData.self.id.toLowerCase();
    console.log(`Logged in as ${rtmStartData.self.name}(${botID}) of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

let rtmConnectionOpened = false;

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {

    if (!message.text) {
        return;
    }

    // forgive trailing spaces and ignore case
    const normalizedMessage = message.text.trim().toLowerCase();
    let now = false;
    let tomorrow = false;

    // only respond to messages where we are mentioned
    if (normalizedMessage.indexOf(`<@${botID}>`) === -1) {
        return;
    }

    // private channel ID isn't available on start, so respond on the channel
    // we're mentioned on.
    botChannel = message.channel;

    if (normalizedMessage.indexOf('weather now') !== -1) {
        now = true;
    }

    if (normalizedMessage.indexOf('weather tomorrow') !== -1) {
        tomorrow = true;
    }

    if (!now && !tomorrow) {
        if (rtmConnectionOpened) {
            if (normalizedMessage.indexOf('help') !== -1) {
                rtm.sendMessage(`<@${message.user}>, try @surry-interview 'weather now' or 'weather tomorrow'`, botChannel);
            } else {
                rtm.sendMessage(`<@${message.user}>, I did not understand that command, try @surry-interview 'weather now' or 'weather tomorrow'`, botChannel);
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
                    rtm.sendMessage(message, botChannel);

                    const now = new Date().getTime();
                    // This url can be used to grab a frame from a DDOT (DC) traffic cam!
                    // This can be used to give a rough visual of the weather. The camera is
                    // at the intersection of 14th St and Independence St NW. Looks like the current
                    // time in milliseconds since 1970 needs to be passed in to get the latest images.
                    // The RTM client doesn't allow sending attachments (see https://api.slack.com/rtm),
                    // but the Slack URL unfurling functionality automatically includes the traffic cam frame!
                    // See http://app.ddot.dc.gov/ for more info.
                    const trafficCamUrl = `http://ie.trafficland.com/v1.0/200146/full?system=ddot&pubtoken=b4c0b819f66741b99fdb17c963f47e3bafd09b494019ee9624f1d38641ebc6bf&refreshRate=2000&t=${now}`

                    // the RTM client unfortunately doesn't support formatting of URLs with <URL|human-friendly-string>
                    rtm.sendMessage(`Here's a snapshot of the current weather at 14th St and Independence St in DC: ${trafficCamUrl}`, botChannel);
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
                    rtm.sendMessage(message, botChannel);
                } else {
                    rtm.sendMessage('There is no forecast for tomorrow! The end is nigh.', botChannel);
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
    console.error(`Couldn't fetch the current forecast from darksky: ${error}`);
});

rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
    // need to wait for the client to fully connect before we can send messages
    rtmConnectionOpened = true;

    let rule = new schedule.RecurrenceRule();

    //schedule recurrence for 9am
    rule.hour = 9;
    dailyAnnounceJob = schedule.scheduleJob(rule, () => {
        console.log(`Checking if today's forecast is different from yesterday's...`);
        util.getCurrentWeatherReport().then((json) => {
            if (json.currently.icon != currentWeatherIcon) {
                if (rtmConnectionOpened) {
                    let message = 'Hey everybody, it looks like there is a change in weather from yesterday.\n';
                    message += util.generateCurrentReport(json.currently);
                    rtm.sendMessage(message, botChannel);
                }
            }
            currentWeatherIcon = json.currently.icon;
        });
    });
});

rtm.start();

process.on('SIGINT', () => {
    console.log('Disconnecting RTM client...');
    rtmConnectionOpened = false;
    dailyAnnounceJob.cancel();
    rtm.disconnect();
});
