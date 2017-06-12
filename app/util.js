const request = require('request-promise');

function getTomorrowAtNoon() {
    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12);
    return tomorrow;
}

const latitude = 38.8892681;
const longitude = -77.0501425;
const darkskyToken = process.env.DARKSKY_TOKEN || '';

// we don't need the minutely or hourly forecast, so we'll exclude them
const darkskyUrlBase = `https://api.darksky.net/forecast/${darkskyToken}/${latitude},${longitude}`;

// returns a promise that resolves to the JSON representing the current weather
// report from darksky on success
function getCurrentWeatherReport() {
    const darkskyCurrentlyUrl = `${darkskyUrlBase}` + '?exclude=minutely,hourly';
    return request({ uri: darkskyCurrentlyUrl, json: true });
}

function getTomorrowsWeatherReport() {
    const darkskyTomorrowUrl = `${darkskyUrlBase}` + getTomorrowAtNoon().getTime() + '?exclude=currently,minutely,hourly';
    return request({ uri: darkskyTomorrowUrl, json: true });
}

function generateCurrentSummary(dataBlock) {
    return generateWeatherReport(dataBlock, 'is currently', 'feels like');
}

function generateTomorrowsSummary(dataBlock) {
    return generateWeatherReport(dataBlock, 'tomorrow will be', 'will feel like');
}

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

// turns a darksky JSON data block into a human-readable string
// https://darksky.net/dev/docs/response#data-block
function generateWeatherReport(dataBlock, summaryVerb, temperatureVerb) {
    let report = '';
    let summary = dataBlock.summary.toLowerCase();

    if (dataBlock.icon && icon2Emoji.hasOwnProperty(dataBlock.icon)) {
        report = icon2Emoji[dataBlock.icon] + ' ';
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

module.exports.getTomorrowAtNoon = getTomorrowAtNoon;
module.exports.getCurrentWeatherReport = getCurrentWeatherReport;
module.exports.getTomorrowsWeatherReport = getTomorrowsWeatherReport;
module.exports.generateCurrentSummary = generateCurrentSummary;
module.exports.generateTomorrowsSummary = generateTomorrowsSummary;