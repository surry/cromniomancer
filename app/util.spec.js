'use strict';

const util = require('./util');
const expect = require('chai').expect;

describe('util module', () => {

    describe('getTomorrowAtNoon', () => {
        it('should return Date object representing noon tomorrow', () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const tomorrowNoon = util.getTomorrowAtNoon();
            expect(tomorrowNoon.getHours()).to.equal(12);
            expect(tomorrow.getDate()).to.equal(tomorrow.getDate());

        });
    });

    describe('generateCurrentReport', () => {
        it('should return a string summarizing the current weather', () => {
            const report = util.generateCurrentSummary({
                icon: 'rain',
                summary: 'rainy with a chance of meatballs',
                apparentTemperature: 63.3
            });

            expect(report).to.equal(`\u{1f327} The weather is currently rainy with a chance of meatballs. It feels like 63.3\u00b0 F.`);

        });

        it('should handle unknown values for the icon field', () => {
            const report = util.generateCurrentSummary({
                icon: 'acid-rain',
                summary: 'rainy with a chance of meatballs',
                apparentTemperature: 63.3
            });

            expect(report).to.equal(`The weather is currently rainy with a chance of meatballs. It feels like 63.3\u00b0 F.`);

        });
    });

    describe('generateTomorrowsReport', () => {
        it('should return a string summarizing the weather tomorrow', () => {
            const report = util.generateTomorrowsSummary({
                icon: 'rain',
                summary: 'rainy with a chance of meatballs',
                apparentTemperature: 63.3
            });

            expect(report).to.equal(`\u{1f327} The weather tomorrow will be rainy with a chance of meatballs. It will feel like 63.3\u00b0 F.`);

        });

    });

});
