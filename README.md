## outboard-cowl

> A simple adapter to outboard.

This adapter allows to show the description of the response scheme, the reason for that was to make Snowboard more useful for documenting complex responses.

## Usage

Install dependencies

```shell
npm install --save outboard-cowl
```

Clean default outboard adapter and register the cowl.

```es6
const outboard = require("outboard");
const cowlOutboardAdapter = require("new-outboard");

outboard.adapters = []

outboard.use(cowlOutboardAdapter)
```

That's it.
