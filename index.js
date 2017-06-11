var RtmClient = require('@slack/client').RtmClient;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var schedule = require('node-schedule');

const https = require('https');

const request = require('request-promise');

var botToken = process.env.SLACK_BOT_TOKEN || '';
const darkskyToken = process.env.DARKSKY_TOKEN || '';

if (!botToken || !darkskyToken) {
    console.error('SLACK_BOT_TOKEN and DARKSKY_TOKEN must be passed as environment variables!');
    process.exit(1);
}

const latitude = 38.8892681;
const longitude = -77.0501425;

// we don't need the minutely or hourly forecast, so we'll exclude them
const darkskyUrlBase = `https://api.darksky.net/forecast/${darkskyToken}/${latitude},${longitude}`;


var rtm = new RtmClient(botToken);

let botID;

function getTomorrowAtNoon() {
    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12);
    return tomorrow;
}

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
    // looks like self.id should always be present - https://api.slack.com/methods/rtm.start
    botID = rtmStartData.self.id.toLowerCase();
    console.log(`Logged in as ${rtmStartData.self.name}(${botID}) of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

let channel;
let rtmConnectionOpened = false;

// maps the darksky 'icon' field to an appropriate emoji representation!
const icon2Emoji = {
    'clear-day': '\u{2600}',
    'clear-night': '\u{1f31d}',
    'rain': '\u{1f327}',
    'snow': '\u{1f328}',
    'sleet': '\u{2744}\u{2614}',
    'wind': '\u{1f32c}',
    'fog': '\u{1f32b}',
    'cloudy': '\u{1f325}',
    'partly-cloudy-day': '\u{1f324}',
    'partly-cloudy-night': '\u{2601}'
};

// returns a promise that resolves to
function getCurrentWeatherReport() {
    const darkskyCurrentlyUrl = `${darkskyUrlBase}` + '?exclude=minutely,hourly';
    return request({ uri: darkskyCurrentlyUrl, json: true });
}

function getTomorrowsWeatherReport() {
    const darkskyTomorrowUrl = `${darkskyUrlBase}` + getTomorrowAtNoon().getTime() + '?exclude=currently,minutely,hourly';
    return request({ uri: darkskyTomorrowUrl, json: true });
}

function generateCurrentReport(dataBlock) {
    return generateWeatherReport(dataBlock, 'is currently', 'feels like');
}

function generateTomorrowsReport(dataBlock) {
    return generateWeatherReport(dataBlock, 'tomorrow will be', 'will feel like');
}

// turns a darksky JSON data block into a human-readable string
// https://darksky.net/dev/docs/response#data-block
function generateWeatherReport(dataBlock, summaryVerb, temperatureVerb) {
    let report;
    let summary = dataBlock.summary.toLowerCase();

    if (dataBlock.icon) {
        report = icon2Emoji[dataBlock.icon];
    }
    report += `The weather ${summaryVerb} ${summary}`
    if (!report.endsWith('.')) {
        report += '.';
    }
    if (dataBlock.apparentTemperature) {
        report += ` It ${temperatureVerb} ${dataBlock.apparentTemperature}\u00b0 F.`;
    }

    return report;
}

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
        getCurrentWeatherReport().then((json) => {
            if (rtmConnectionOpened) {
                if (json.currently) {
                    let message = generateCurrentReport(json.currently);
                    rtm.sendMessage(message, channel);
                }
            }
        }).catch((error) => {
            console.error(error);
        });
    }

    if (tomorrow) {
        getTomorrowsWeatherReport().then((json) => {
            if (rtmConnectionOpened) {
                if (json.daily.data.length >= 1) {
                    let message = generateTomorrowsReport(json.daily.data[0]);
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

getCurrentWeatherReport().then((json) => {
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
        getCurrentWeatherReport().then((json) => {
            if (json.currently.icon != currentWeatherIcon) {
                if (rtmConnectionOpened) {
                    let message = 'Hey everybody, it looks like there is a change in weather from yesterday.\n'
                    message += generateCurrentReport(json.currently);
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
