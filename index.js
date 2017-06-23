'use strict';

const RtmClient = require('@slack/client').RtmClient;
const RTM_EVENTS = require('@slack/client').RTM_EVENTS;
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
const schedule = require('node-schedule');

const { util } = require('./app');


const botToken = process.env.SLACK_BOT_TOKEN || '';
const darkskyToken = process.env.DARKSKY_TOKEN || '';

// fixed coordinates used to query darksky
const dcLocation = {
    latitude: 38.8892681,
    longitude: -77.0501425
};

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

//let rtmConnectionOpened = false;

function sendMessage(message, channel) {
    if (rtm.connected) {
        rtm.sendMessage(message, channel);
    }
}

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
        if (normalizedMessage.indexOf('help') !== -1) {
            sendMessage(`<@${message.user}>, try @surry-interview 'weather now' or 'weather tomorrow'`, botChannel);
        } else {
            sendMessage(`<@${message.user}>, I did not understand that command, try @surry-interview 'weather now' or 'weather tomorrow'`, botChannel);
            console.log('Ignoring unknown command: ' + normalizedMessage.substring(0, 20) + '...');
        }
        return;
    }

    if (now) {
        util.getCurrentWeatherReport(dcLocation).then((json) => {
            if (json.currently) {
                let message = util.generateCurrentSummary(json.currently);
                sendMessage(message, botChannel);

                const now = new Date().getTime();

                //const pubToken = 'cd9a42a7b90faf60201abd35180ca9040efd8ffc737439dd604662b03a8a742a';
                //const trafficCamUrl = `http://ie.trafficland.com/v1.0/200146/full?system=ddot&pubtoken=${pubtoken}&refreshRate=2000&t=${now}`

                util.getTrafficCamImageUrl().then((camera) => {
                    // the RTM client unfortunately doesn't support formatting of URLs with <URL|human-friendly-string>
                    sendMessage(`Here's a snapshot of the current weather at ${camera.name}: ${camera.content.fullJpeg}&t=${Date.now()}`, botChannel);
                }).catch(console.error);

            }
        }).catch(console.error);
    }

    if (tomorrow) {
        util.getTomorrowsWeatherReport(dcLocation).then((json) => {
            if (json.daily.data.length >= 1) {
                let message = util.generateTomorrowsSummary(json.daily.data[0]);
                sendMessage(message, botChannel);
            } else {
                sendMessage('There is no forecast for tomorrow! The end is nigh.', botChannel);
            }
        }).catch(console.error);
    }
});

let dailyAnnounceJob;
let currentWeatherIcon;

util.getCurrentWeatherReport(dcLocation).then((json) => {
    currentWeatherIcon = json.currently.icon;
}).catch((error) => {
    console.error(`Couldn't fetch the current forecast from darksky: ${error}`);
});

rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, () => {
    // need to wait for the client to fully connect before we can send messages
    //rtmConnectionOpened = true;

    let rule = new schedule.RecurrenceRule();

    //schedule recurrence for 9am
    rule.hour = 9;
    rule.minute = 0;
    dailyAnnounceJob = schedule.scheduleJob(rule, () => {
        console.log(`Checking if today's forecast is different from yesterday's...`);
        util.getCurrentWeatherReport(dcLocation).then((json) => {
            if (json.currently.icon != currentWeatherIcon) {
                let message = 'Hey everybody, it looks like there is a change in weather from yesterday.\n';
                message += util.generateCurrentReport(json.currently);
                sendMessage(message, botChannel);
            }
            currentWeatherIcon = json.currently.icon;
        }).catch(console.error);
    });
});

rtm.start();

process.on('SIGINT', () => {
    console.log('Disconnecting RTM client...');
    //rtmConnectionOpened = false;
    dailyAnnounceJob.cancel();
    rtm.disconnect();
});
