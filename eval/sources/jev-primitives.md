# Jev question types (test fixture)

Written for the eval from TypeSafe's docs as of 2026-09. Not a copy of the docs.

## Choice

- Selects one option from a list of up to 255 options.
- Returns the selected option, a probability for every option, and a confidence value.

## Score

- Places the state on a scale of 2 to 10 levels.
- Returns an expected score, which may fall between levels, plus a confidence value.

## Noul

- Answers a yes-or-no statement with a probability of yes between 0 and 1.
- Noul answers have no separate confidence value.
