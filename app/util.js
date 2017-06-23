'use strict';

const request = require('request-promise');

// returns a Date representing tomorrow at 12pm so that
// we can issue darksky 'time machine' requests to get an
// idea of the weather tomorrow at a time that should be
// relevant to someone interested in the weather
function getTomorrowAtNoon() {
    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12);
    return tomorrow;
}

// This url can be used to grab a frame from a DDOT (DC) traffic cam!
// This can be used to give a rough visual of the weather. The camera is
// at the intersection of 14th St and Independence St NW. Looks like the current
// time in milliseconds since 1970 needs to be passed in to get the latest images.
// The RTM client doesn't allow sending attachments (see https://api.slack.com/rtm),
// but the Slack URL unfurling functionality automatically includes the traffic cam frame!
// See http://app.ddot.dc.gov/ for more info.
function getTrafficCamImageUrl() {
    const trafficlandApiUrl = 'http://api.trafficland.com/v1.5/json/video_feeds?system=ddot&key=1594c8892d7fbd18181a8a6a44958b28&region=WAS';
    let promise = request({ uri: trafficlandApiUrl, json: true }).then((json) => {
        if (Array.isArray(json)) {
            let cameraObj = json.find((element) => {
                return element.publicId === '200146'
            });

            if (cameraObj) {
                return cameraObj;
            } else {
                throw 'Unable to find desired traffic camera!';
            }
        }
    });

    return promise;
}

const darkskyToken = process.env.DARKSKY_TOKEN || '';
const darkskyUrlBase = `https://api.darksky.net/forecast/${darkskyToken}`;

// returns a promise that resolves to the JSON representing the current weather
// report from darksky on success
function getCurrentWeatherReport(location) {
    // we don't need the minutely or hourly forecast, so we'll exclude them
    const darkskyCurrentlyUrl = `${darkskyUrlBase}/${location.latitude},${location.longitude}` + '?exclude=minutely,hourly';
    return request({ uri: darkskyCurrentlyUrl, json: true });
}

function getTomorrowsWeatherReport(location) {
    const darkskyTomorrowUrl = `${darkskyUrlBase}/${location.latitude},${location.longitude},` + Math.floor(getTomorrowAtNoon().getTime() / 1000 ) + '?exclude=currently,minutely,hourly';
    return request({ uri: darkskyTomorrowUrl, json: true });
}

// groups sets of strings used to generate messages summarizing the
// weather at some point in time
const weatherVerbs = {
    currently: {
        summary: 'is currently',
        temperature: 'feels like'
    },
    tomorrow: {
        summary: 'tomorrow will be',
        temperature: 'will feel like'
    }
};

function generateCurrentSummary(dataBlock) {
    return generateWeatherReport(dataBlock, weatherVerbs.currently);
}

function generateTomorrowsSummary(dataBlock) {
    return generateWeatherReport(dataBlock, weatherVerbs.tomorrow);
}

// maps the darksky 'icon' field to an appropriate emoji representation!
// not supported by jshint yet - https://github.com/jshint/jshint/pull/2413
const icon2Emoji = {
    /* jshint ignore:start */
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
    /* jshint ignore:end */
};

// turns a darksky JSON data block into a human-readable string
// https://darksky.net/dev/docs/response#data-block
function generateWeatherReport(dataBlock, when) {
    let report = [];
    let summary = dataBlock.summary.toLowerCase();

    if (dataBlock.icon && icon2Emoji.hasOwnProperty(dataBlock.icon)) {
        report.push(icon2Emoji[dataBlock.icon]);
    }

    summary = `The weather ${when.summary} ${summary}`;
    if (!summary.endsWith('.')) {
        summary += '.';
    }
    report.push(summary);

    if (dataBlock.apparentTemperature) {
        report.push(`It ${when.temperature} ${dataBlock.apparentTemperature}\u00b0 F.`);
    }

    return report.join(' ');
}

module.exports.getTomorrowAtNoon = getTomorrowAtNoon;
module.exports.getTrafficCamImageUrl = getTrafficCamImageUrl;
module.exports.getCurrentWeatherReport = getCurrentWeatherReport;
module.exports.getTomorrowsWeatherReport = getTomorrowsWeatherReport;
module.exports.generateCurrentSummary = generateCurrentSummary;
module.exports.generateTomorrowsSummary = generateTomorrowsSummary;