# cromniomancer
[Cromniomancer](https://en.wikipedia.org/wiki/Cromniomancy) is a Slackbot that reports the weather!

Currently it is limited to reporting on weather in the Washington, DC area.

# Running the Bot

Once you've run `npm install`, run `node index.js` to start the bot. Be sure to pass in `SLACK_BOT_TOKEN`
and `DARKSKY_TOKEN` as environment variables so the bot can connect to Slack and Darksky.

A Ctrl+C/SIGINT will cause the bot to disconnect and shutdown.

# Running Tests

You can use `npm run test` to run the mocha unit tests.

`npm run coverage` will run the tests and generate a coverage report in *coverage/lcov-report/index.html*.

Use `npm run jshint` to run jshint.

