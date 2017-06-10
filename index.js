var RtmClient = require('@slack/client').RtmClient;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;

const https = require('https');

const request = require('request');

var bot_token = process.env.SLACK_BOT_TOKEN || '';
const darkskyToken = process.env.DARKSKY_TOKEN || '';

if (!bot_token || !darkskyToken) {
    console.error('SLACK_BOT_TOKEN and DARKSKY_TOKEN must be passed as environment variables!');
    process.exit(1);
}

const latitude = 38.8892681;
const longitude = -77.0501425;
const darkskyURL = `https://api.darksky.net/forecast/${darkskyToken}/${latitude},${longitude}`;

var rtm = new RtmClient(bot_token);

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
    console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

let channel;
let rtmConnectionOpened = false;

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
    console.log('Message:', message);

    if (!channel) {
        channel = message.channel;
    }

    const normalizedMessage = message.text.trim().toLowerCase();
    let now;

    if (normalizedMessage === 'weather now') {
        now = true;
    } else if (normalizedMessage === 'weather tomorrow') {
        now = false;
    }

    request(darkskyURL, (error, response, body) => {
        console.error(error);
        let json = JSON.parse(body);
        if (json) {
            if (rtmConnectionOpened) {
                if (now === true && json.currently.summary) {
                    let message = `The weather is currently ${json.currently.summary} and it feels like ${json.currently.apparentTemperature}\u00b0 F.`;
                    rtm.sendMessage(message, channel);
                } else if (now === false) {
                    //rtm.sendMessage(, channel);
                }
            }
        }
    });
});

// you need to wait for the client to fully connect before you can send messages
rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
    rtmConnectionOpened = true;
});


rtm.start();
