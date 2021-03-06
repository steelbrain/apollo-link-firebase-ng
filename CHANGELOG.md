### 0.2.2

- Republish to workaround NPM issue

### 0.2.1

- Ignore non-package files in npm package

### 0.2.0

- Fix handling of null ref values
- Add support for `transformRef` inside `@firebase`

### 0.1.2

- Fix order of results when sorting is used
- Fix casting of Int and Float values in GQL literals

### 0.1.1

- Add support for `@import` in top-level fields

### 0.1.0

- Internal rewrite to move away from Observables (no Public API changes)
  Benefit of rewrite is less memory/cpu usage, downside is that objects are
  now to be considered mutable (for subscriptions). Clone them if/when necessary.

### 0.0.4

- Add support for `@defer`
- Improved value diffing for array values
- Allow using operation variables in interpolation

### 0.0.3

- Handle deleted firebase nodes

### 0.0.2

- Fix bug around variable consumption
- Handle case of no results from Firebase
- Misc fixes around value calculation

### 0.0.1

- Initial release
