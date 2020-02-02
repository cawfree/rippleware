# rippleware
A middleware-inspired toolbox which enables you to design fully customizable functions.

<a href="#badge">
    <img alt="code style: prettier" src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square"></a>

#### 🌠 tl;dr
It's like a [Factory Pattern](https://www.dofactory.com/javascript/factory-method-design-pattern) for arbitrary sequences of data manipulation. You can think of it as like [express](https://www.npmjs.com/package/express) for computation.

## 🔥 Features
  - Deeply configurable, user-extensible function definitions.
    - Design arbitrarily long sequences of data manipulation.
    - Define multiple routes based on [`type-check`](https://www.npmjs.com/package/type-check) rigorous declaration syntax.
  - Using hooks, you can persist and react to dynamics.
    - You can cache and respond to middleware results from previous executions.
  - Synchronous execution, independent of middleware asynchrony. (yes, _really_)
    - If you're tired of `async`/`await` or `.then()`, you [don't have to use them at all](https://www.npmjs.com/package/deasync).
  - A friendly interface. 👋
    - If you know [middleware](https://expressjs.com/en/guide/writing-middleware.html), then you know rippleware.
    - Intuitive indexing enables simple operation on deeply-nested propagated data.

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

The only entity that is exported from rippleware is `compose`, which we can `use()` to define each step in our function:

```javascript
import compose from 'rippleware';

const app = compose()
  .use(handle => handle('*', () => "Hello, world!")); // handle('*', () => Promise.resolve("Hello, world!")) would behave identically
  
  //.use().use().use()...

console.log(app()); // "Hello, world!"
```

Let's break this down. When make a call to use, we're expected to pass a `Function` that accepts a single argument, `handle`, which is used to define all of the routes for that step in your middleware based upon the input data shape. Here, we use the asterisk (`*`) to accept any data whatsoever. Therefore, when we make a call to `app()` with undefined arguments, rippleware routes the data successfully to the handler.

It's important to note that your handler functions can operate _asynchronously_ via [`Promises`](https://developers.google.com/web/fundamentals/primers/promises) or [`async`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)functions, the result will still return synchronously.

> For a detailed look at the capabilities of routing strings, check out [type-check](https://www.npmjs.com/package/type-check).

**Note**:
If you'd prefer, you can opt out of synchronous behaviour by passing `{ sync: false }` to your call to `compose()`.

### 2. Routing

You can make multiple calls to `handle` within a single middleware; these define the different operations that can be performed based upon the shape of the input data. Since each handler is compared against in the order they were defined, care should be taken to ensure that multiple handler allocations should use increasingly generalized checkers.

```javascript
import compose from 'rippleware';

const app = compose()
  .use(
    (handle) => {
      handle('String', () => "You passed a string!");
      handle('*', () => "You didn't pass a string!");
    },
  );

console.log(app('This is a string.')) // "You passed a string!"
console.log(app({ life: 42 })) // "You didn't pass a string!"
```

You don't have to define routes just based on strict type checking. You can just as easily define a **matcher function**:

```javascript
const app = compose()
  .use(
    (handle) => {
      handle(input => (typeof input === 'string'), () => "You passed a string!");
      handle(input => (typeof input !== 'string'), () => "You didn't pass a string!");
    },
  );
```

If a valid route is not found, the incompatible `.use()` stage will throw and prevent subsequent stages from being executed for the active invocation.

### 3. Indexing

#### 3.1 Array Indexing

It is possible to define a specific interest in processing and returning only a subset of returned array data.

```javascript
import compose from 'rippleware';

const addOneToANumber = () => handle => handle("Number", n => n + 1);

const app = compose()
  .use([addOneToANumber()]);
  
console.log(app([2])); // 3
```

Notice that we pass an array `[2]` into our `app`, but because we use indexing on the middleware definition, it only operates on the first element of the input data. This is how we retrieve a scalar result.


#### 3.2 Object Indexing

In addition, it's possible to filter specific properties of a given object by supplying a [regular expression](https://www.w3schools.com/js/js_regexp.asp). The regular expression must be expressed in a form compatible with [`jsonpath`](https://www.npmjs.com/package/jsonpath).

```javascript
import compose from 'rippleware';

const app = compose()
  .use(/$.*.t/);

console.log(app([{t: 'hi'}, {t: 'bye'}])); // ['hi', 'bye']
```

In addition, you can apply these expressions to multiple arguments:

```javascript
import compose from 'rippleware';

const app = compose()
  .use(/$.*.t/, /$.*.s/);


console.log(app([{t: 'hi'}], [{s: 0}])); // [['hi'], [0]]
```

Alternatively, you can choose to aggregate multiple indexes over a single parameter:

```javascript
import compose from 'rippleware';

const app = compose()
  .use([/$.*.t/, /$.*.s/]);

console.log(app([{t: 'hi', s: 0}, {t: 'bye', s: 1}])); // [['hi', 'bye'], [0, 1]]
```

### 4. Hooks

It's possible to take advantage of [React](https://reactjs.org/)-inspired [hooks](https://reactjs.org/docs/hooks-intro.html) inside of your middleware functions. In the example below, we cache props from the first invocation and rely return this forever after.

```javascript
import compose from 'rippleware';

const app = compose()
  .use(
    '*', handle => handle(
      (nextProps, { useState }) => {
        const [state] = useState(() => nextProps);
        return state;
      },
    ),
  );

app('The only value this will ever return.'); // "The only value this will ever return."
app('Some other value')); // "The only value this will ever return."
```

### 5. Shorthand Notation
Finally, now that we're familiar with the underpinnings of rippleware, you'll find it useful to know that it's possible to directly declare handler functions inline:

```javascript
import compose from 'rippleware';

const app = compose()
  .use('*', input => input + 1);

console.log(app(2)); // 3
```

This format of handler definition assumes a single default handler of your middleware arguments.

## 🎒 Builtins

### `justOnce`
Executes the wrapped middleware on the first execution and will propagate the input signals unmodified for all future passes.

```javascript
import compose, { justOnce } from 'rippleware';

const app = compose()
  .use(justOnce('*', input => !input));

console.log(app(true)); // false
console.log(app(true)); // true
console.log(app(true)); // true
```

## 😎 Contributing

This is an active project, and your contributes are welcome! Before submitting any [Pull Requests](https://github.com/cawfree/rippleware/pulls), please ensure all existing unit tests pass with a call to `yarn jest`.

## ✌️ License
[MIT](https://opensource.org/licenses/MIT)

<p align="center">
  <a href="https://www.buymeacoffee.com/cawfree">
    <img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy @cawfree a coffee" width="232" height="50" />
  </a>
</p>
