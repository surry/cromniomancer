var RtmClient = require('@slack/client').RtmClient;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;

const https = require('https');

const request = require('request');

var botToken = process.env.SLACK_BOT_TOKEN || '';
const darkskyToken = process.env.DARKSKY_TOKEN || '';

if (!botToken || !darkskyToken) {
    console.error('SLACK_BOT_TOKEN and DARKSKY_TOKEN must be passed as environment variables!');
    process.exit(1);
}

const latitude = 38.8892681;
const longitude = -77.0501425;

// we don't need the minutely or hourly forecast, so we'll exclude them
const darkskyURL = `https://api.darksky.net/forecast/${darkskyToken}/${latitude},${longitude}?exclude=minutely,hourly`;

var rtm = new RtmClient(botToken);

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
    console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

let channel;
let rtmConnectionOpened = false;

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

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {

    if (!channel) {
        channel = message.channel;
    }

    // forgive trailing spaces and ignore case
    const normalizedMessage = message.text.trim().toLowerCase();
    let now = false;
    let tomorrow = false;

    if (normalizedMessage.indexOf('weather now') !== -1) {
        now = true;
    }

    if (normalizedMessage.indexOf('weather tomorrow') !== -1) {
        tomorrow = true;
    }

    if (now || tomorrow) {
        request(darkskyURL, (error, response, body) => {
            if (error) {
                console.error(error);
            } else {
                let json = JSON.parse(body);

                if (json) {
                    if (rtmConnectionOpened) {
                        if (now && json.currently.summary) {
                            let summary = json.currently.summary.toLowerCase();
                            let message;
                            if (json.currently.icon) {
                                message = icon2Emoji[json.currently.icon];
                            }
                            message += `The weather is currently ${summary}`
                            if (!message.endsWith('.')) {
                                message += '.';
                            }
                            if (json.currently.apparentTemperature) {
                                message += `It feels like ${json.currently.apparentTemperature}\u00b0 F.`;
                            }
                            rtm.sendMessage(message, channel);
                        }

                        if (tomorrow) {
                            if (json.daily.data.length >= 2) {
                                let summary = json.daily.data[1].summary.toLowerCase();
                                let message;
                                if (json.currently.icon) {
                                    message = icon2Emoji[json.currently.icon];
                                }
                                message += `The weather tomorrow will be ${summary}`
                                if (!message.endsWith('.')) {
                                    message += '.';
                                }
                                if (json.daily.data[1].apparentTemperature) {
                                    message += `It will feel like ${json.daily.data[1].apparentTemperature}\u00b0 F.`;
                                }
                                rtm.sendMessage(message, channel);
                            } else {
                                rtm.sendMessage(`There is no forecast for tomorrow! The end is nigh.`, channel);
                            }
                        }
                    }
                }
            }
        });
    } else {
        if (rtmConnectionOpened) {
            if (normalizedMessage === 'help') {
                rtm.sendMessage('try @surry-interview \'weather now\' or \'weather tomorrow\'');
            } else {
                rtm.sendMessage('I did not understand that command, try @surry-interview \'weather now\' or \'weather tomorrow\'');
                console.log('Ignoring unknown command: ' + normalizedMessage.substring(0, 20) + '...');
            }
        }
    }
});

// need to wait for the client to fully connect before we can send messages
rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
    rtmConnectionOpened = true;
});


rtm.start();
