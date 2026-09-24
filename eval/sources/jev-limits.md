# What Jev is bad at (test fixture)

Written for the eval from TypeSafe's docs as of 2026-09. Not a copy of the docs.

- Jev reads your words, not your intent. State conditions explicitly.
- Jev is not a calculator. Do arithmetic in code and pass the result.
- Counting is unreliable. Count in code rather than asking Jev how many items match.
- Score levels are positions, not calibrated magnitudes. Do not read a score of 6 as twice a score of 3.
- Jev cannot write, summarize, or generate text. It only returns typed decisions.
- Jev does not call tools or fetch pages. It judges only the state it is given.
