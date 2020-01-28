import '@babel/polyfill';

import compose from '../src';

const somethingThatHandlesAll = () => handle => {
  handle('*', () => {
    console.log('something that handles all');
    return 42;
  });
};

const somethingThatHandlesAllMulti = () => handle => {
  handle('handlesAllMulti', () => console.log('something that handles all'));
  handle('handlesAllMultiRound2', () => console.log('something that handles all'));
};

const somethingThatHandlesTheFirstElement = () => handle => {
  handle('handlesTheFirstElement', () => console.log('something that handles all'));
  handle('handlesTheFirstElementRound2', () => console.log('something that handles all'));
};

const somethingThatHandlesTheSecondElement = () => handle => {
  handle('handlesTheSecond', () => console.log('something that handles all'));
  handle('handlesTheSecondRound2', () => console.log('something that handles all'));
};

const somethingThatHandlesTheFirstIndex = () => handle => {
  handle('handlesTheFirstIndex', () => console.log('something that handles all'));
};

const somethingThatHandlesTheSecondIndex = () => handle => {
  handle('handlesTheSecondIndex', () => console.log('something that handles all'));
};

const somethingThatHandlesTheSecondIndexFirstIndex = () => handle => {
  handle('handlesTheSecondIndexFirstIndex', () => console.log('something that handles all'));
  handle('handlesTheSecondIndexFirstIndexRound2', () => console.log('something that handles all'));
};

it('should export an argument filtering interface', async () => {

  const app = compose()
    // each handler deserves dedicated state, if it hasn't been executed, it cant get, it is entirely different data, too difficult, just share state
    .use(somethingThatHandlesAll())
    .use(somethingThatHandlesAllMulti())
    .use(
      somethingThatHandlesTheFirstElement(),
      somethingThatHandlesTheSecondElement(),
    )
    .use(
      [somethingThatHandlesTheFirstElement()],
    )
    .use(
      [somethingThatHandlesTheFirstIndex(), somethingThatHandlesTheSecondIndex()],
      [somethingThatHandlesTheFirstIndex(), [somethingThatHandlesTheSecondIndexFirstIndex()]],
    );

  await app('hi');

  expect(true).toBeTruthy();
});
