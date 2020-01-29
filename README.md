# rippleware
A middleware-inspired toolbox which enables you to design fully customizable functions.

#### 🌠 tl;dr
It's like a [Factory Pattern](https://www.dofactory.com/javascript/factory-method-design-pattern) for arbitrary sequences of data manipulation. You can think of it like [express](https://www.npmjs.com/package/express) for computation.

## 🔥 Features
  - Deeply configurable, user-extensible function definitions.
    - Design endlessly configurable, arbitrarily long sequences of data manipulation.
    - Define multiple routes based on [`type-check`](https://www.npmjs.com/package/type-check) rigorous declaration syntax.
  - Optional persistent middleware state.
    - You can cache and respond to middleware results from previous executions.
  - Synchronous execution, independent of middleware asynchrony. (yes, _really_)
    - If you're tired of `async`/`await` or `.then()`, you [don't have to use it at all](https://www.npmjs.com/package/deasync).
  - A friendly interface. 👋
    - If you know [middleware](https://expressjs.com/en/guide/writing-middleware.html), you know rippleware.
    - Intuitive result indexing enables simple operation on deeply-nested propagated data.

## 🚀 Getting Started

Using [`npm`]():

```bash
npm install --save rippleware
```

Using [`yarn`]():

```bash
yarn add rippleware
```

##  Overview

### 1. Hello, world!

The only entity that is exported from ripple was `compose`, which we can `use()` to define each step in our function:

```javascript
import compose from 'rippleware';

const app = compose()
  .use(handle => handle('*', () => "Hello, world!")); // handle('*', () => Promise.resolve("Hello, world!")) would behave identically

console.log(app()); // "Hello, world!"
```

Let's break this down. When make a call to use, we're expected to pass a `Function` that accepts a single argument, `handle`, which is used to define all of the routes for that step in your middleware based upon the input data shape. Here, we use the asterisk (`*`) to accept any data whatsoever. Therefore, when we make a call to `app()` with undefined arguments, rippleware routes the data successfully to the handler.

It's important to note that your handler functions can operate _asynchronously_ via [`Promises`](https://developers.google.com/web/fundamentals/primers/promises) or [`async`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)functions, the result will still return synchronously.

===
For a detailed look at the capabilities of routing strings, check out [type-check](https://www.npmjs.com/package/type-check).
===

**Note**:
If you'd prefer, you can opt out of synchronous behaviour by passing `{ sync: false }` to your call to `compose()`.

### 2. Routing

You can make multiple calls to `handle` within a single middleware; these define the different operations that can be performed based upon the shape of the input data.

```javascript
import compose from 'rippleware';

const app = compose()
  .use(
    (handle) => {
      handle('[String]', () => "You passed a string!");
      handle('*', () => "You didn't pass a string!");
    },
  );

console.log(app('This is a string.')) // "You passed a string!"
console.log({ life: 42 }) // "You didn't pass a string!"
```

## Contributing

## License
[MIT](https://opensource.org/licenses/MIT)
