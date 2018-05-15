import { h, app } from "hyperapp"
import {
  withFx,
  frame,
  delay,
  time,
  log,
  http,
  keydown,
  keyup,
  random,
  debounce,
  throttle
} from "../src"

const dummyView = Function.prototype
const getState = state => state

function clickButton() {
  const buttonElement = document.body.getElementsByTagName("button")[0]
  if (!buttonElement) {
    throw new Error("Couldn't find a button in: " + document.body.innerHTML)
  }
  const clickEvent = new Event("click")
  buttonElement.dispatchEvent(clickEvent)
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("withFx", () => {
  it("should be a function", () => expect(withFx).toBeInstanceOf(Function))
  it("should call view without actions", done =>
    withFx(app)(undefined, undefined, () => done()))
  it("should not interfere with 1.0 actions", done => {
    const main = withFx(app)(
      {
        value: 0
      },
      {
        get: () => state => state,
        up: by => state => ({
          value: state.value + by
        }),
        finish: () => (state, actions) => {
          actions.exit()
        },
        exit: () => {
          done()
        }
      },
      dummyView
    )

    expect(main.get()).toEqual({
      value: 0
    })

    expect(main.up(2)).toEqual({
      value: 2
    })

    expect(main.get()).toEqual({
      value: 2
    })

    main.finish()
  })
  describe("for the view", () => {
    it("should not interfere with 1.0 actions", done =>
      withFx(app)(
        {
          foo: {
            message: "hello"
          }
        },
        {
          foo: {
            bar: data => state => {
              expect(data).toEqual({ message: "goodbye" })
              expect(state).toEqual({ message: "hello" })
              done()
            }
          }
        },
        ({ foo: { message } }, actions) =>
          h(
            "main",
            {
              oncreate: () => {
                expect(document.body.innerHTML).toBe(
                  '<main><h1 class="message">hello</h1><button>foo</button></main>'
                )
                clickButton()
              }
            },
            h("h1", { class: "message" }, message),
            h(
              "button",
              {
                onclick(event) {
                  expect(event).toMatchObject({ type: "click" })
                  actions.foo.bar({ message: "goodbye" })
                }
              },
              "foo"
            )
          ),
        document.body
      ))
    it("should dispatch new state objects", done => {
      const { dispatch } = withFx(app)(
        {
          message: "hello"
        },
        {
          get: () => state => state
        },
        () => h("main", {}, h("button", { onclick: { message: "goodbye" } })),
        document.body
      )
      setTimeout(() => {
        clickButton()
        expect(dispatch(getState)).toEqual({ message: "goodbye" })
        done()
      })
    })
    it("should dispatch unwired action functions", done => {
      const messageWithEmphasis = ({ message }, event) => {
        if (event) {
          expect(event).toMatchObject({ type: "click" })
        }
        return {
          message: `${message} for reals`
        }
      }
      const { dispatch } = withFx(app)(
        {
          message: "hello"
        },
        {},
        () => h("main", {}, h("button", { onclick: messageWithEmphasis })),
        document.body
      )
      setTimeout(() => {
        clickButton()
        expect(dispatch(getState)).toEqual({ message: "hello for reals" })
        done()
      })
    })
    it("should dispatch in subviews", done => {
      const Component = () => () =>
        h("main", {}, h("button", { onclick: { message: "goodbye" } }))
      const { dispatch } = withFx(app)(
        {
          message: "hello"
        },
        {
          get: () => state => state
        },
        () => h("div", {}, [h(Component, {})]),
        document.body
      )
      setTimeout(() => {
        clickButton()
        expect(dispatch(getState)).toEqual({ message: "goodbye" })
        done()
      })
    })
  })
  describe("for interop", () => {
    it("should return a dispatch function", () => {
      const { dispatch } = withFx(app)({}, {}, dummyView)
      expect(dispatch).toBeInstanceOf(Function)
    })
    it("should get state when dispatching an identity action", () => {
      const { dispatch } = withFx(app)({ count: 1 }, {}, dummyView)
      expect(dispatch(getState)).toEqual({ count: 1 })
    })
    it("should dispatch new state objects", () => {
      const { dispatch } = withFx(app)({ count: 1 }, {}, dummyView)
      expect(dispatch({ count: 0 })).toEqual({ count: 0 })
      expect(dispatch(getState)).toEqual({ count: 0 })
    })
    it("should dispatch unwired action functions", () => {
      const up = ({ count }) => ({ count: count + 1 })
      const { dispatch } = withFx(app)({ count: 0 }, {}, dummyView)
      expect(dispatch(up)).toEqual({ count: 1 })
      expect(dispatch(getState)).toEqual({ count: 1 })
    })
    it("should dispatch mix of state and actions in an array", () => {
      jest.useFakeTimers()
      try {
        const { dispatch } = withFx(app)({}, {}, dummyView)
        const up = ({ count }) => ({ count: count + 1 })

        dispatch([{ count: 1 }, up])
        expect(dispatch(getState)).toEqual({})
        jest.runAllTimers()
        expect(dispatch(getState)).toEqual({ count: 2 })
      } finally {
        jest.useRealTimers()
      }
    })
    describe("frame", () => {
      it("should call animation frame", done => {
        const timestamp = 9001
        global.requestAnimationFrame = jest.fn(cb => cb(timestamp))
        const { dispatch } = withFx(app)({}, {}, dummyView)
        dispatch(
          frame((state, data) => {
            expect(data).toBe(timestamp)
            done()
          })
        )
        expect(requestAnimationFrame).toBeCalledWith(expect.any(Function))
        delete global.requestAnimationFrame
      })
    })
    describe("delay", () => {
      it("should fire an action after a delay", () => {
        jest.useFakeTimers()
        try {
          const { dispatch } = withFx(app)({ count: 1 }, {}, dummyView)
          const up = ({ count }, by) => ({ count: count + by })
          dispatch(delay(1000, up, 2))
          expect(dispatch(getState)).toEqual({ count: 1 })
          jest.runAllTimers()
          expect(dispatch(getState)).toEqual({ count: 3 })
        } finally {
          jest.useRealTimers()
        }
      })
    })
    describe("time", () => {
      it("should get the current time", done => {
        const timestamp = 9001
        global.performance.now = () => timestamp
        const { dispatch } = withFx(app)({}, {}, dummyView)
        dispatch(
          time((state, data) => {
            expect(data).toBe(timestamp)
            done()
          })
        )
        delete global.performance.now
      })
    })
    /* eslint-disable no-console */
    describe("log", () => {
      it("should log to console", done => {
        const testArgs = ["bar", { some: "data" }, ["list", "of", "data"]]
        const defaultLog = console.log
        console.log = function(...args) {
          expect(args).toEqual(testArgs)
          done()
        }
        const { dispatch } = withFx(app)({}, {}, dummyView)
        dispatch(log(...testArgs))
        console.log = defaultLog
      })
    })
    /* eslint-enable no-console */
    describe("http", () => {
      it("should get json", done => {
        const defaultFetch = global.fetch
        const testUrl = "https://example.com"
        global.fetch = (url, options) => {
          expect(url).toBe(testUrl)
          expect(options).toEqual({})
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ results: [1, 2, 3] })
          })
        }
        const { dispatch } = withFx(app)({}, {}, dummyView)
        const setData = (state, response) => ({ data: response })
        dispatch(http(testUrl, setData))
        setTimeout(() => {
          expect(dispatch(getState)).toEqual({ data: { results: [1, 2, 3] } })
          done()
        })
        global.fetch = defaultFetch
      })
      it("should get text", done => {
        const defaultFetch = global.fetch
        const testUrl = "https://example.com"
        global.fetch = (url, options) => {
          expect(url).toBe(testUrl)
          expect(options).toEqual({})
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve("hello world")
          })
        }
        const { dispatch } = withFx(app)({}, {}, dummyView)
        const setMessage = (state, message) => ({ message })
        dispatch(http(testUrl, setMessage, { response: "text" }))
        setTimeout(() => {
          expect(dispatch(getState)).toEqual({ message: "hello world" })
          done()
        })
        global.fetch = defaultFetch
      })
      it("should post json", done => {
        const defaultFetch = global.fetch
        const testUrl = "/login"
        global.fetch = (url, options) => {
          expect(url).toBe(testUrl)
          expect(options).toEqual({
            method: "POST",
            body: {
              user: "username",
              pass: "password"
            }
          })
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ status: "authenticated", token: "1234" })
          })
        }
        const { dispatch } = withFx(app)({}, {}, dummyView)
        const setData = (state, response) => ({ user: response })
        dispatch(
          http(testUrl, setData, {
            method: "POST",
            body: { user: "username", pass: "password" }
          })
        )
        setTimeout(() => {
          expect(dispatch(getState)).toEqual({
            user: { status: "authenticated", token: "1234" }
          })
          done()
        })
        global.fetch = defaultFetch
      })
      it("should call the error handler on network error", done => {
        const defaultFetch = global.fetch
        const testUrl = "https://example.com"
        const error = new Error("Failed")
        global.fetch = (url, options) => {
          expect(url).toBe(testUrl)
          expect(options).toEqual({})
          return Promise.reject(error)
        }
        const { dispatch } = withFx(app)({}, {}, dummyView)
        const setMessage = () => {
          done.fail(new Error("Should not be called"))
        }
        const errorHandler = (state, err) => {
          expect(err).toBe(error)
          done()
        }
        dispatch(http(testUrl, setMessage, { error: errorHandler }))

        global.fetch = defaultFetch
      })
      it("should call the error handler when response is not OK", done => {
        const defaultFetch = global.fetch
        const testUrl = "https://example.com"
        const response = {
          ok: false
        }
        global.fetch = (url, options) => {
          expect(url).toBe(testUrl)
          expect(options).toEqual({})
          return Promise.resolve(response)
        }
        const { dispatch } = withFx(app)({}, {}, dummyView)
        const setMessage = () => {
          done.fail(new Error("Should not be called"))
        }
        const errorHandler = (state, err) => {
          expect(err).toBe(response)
          done()
        }
        dispatch(http(testUrl, setMessage, { error: errorHandler }))

        global.fetch = defaultFetch
      })
    })
    describe("keydown", () => {
      it("should attach keydown listener", done => {
        const keyEvent = { key: "a", code: "KeyA" }
        const { dispatch } = withFx(app)({}, {}, dummyView)
        dispatch(
          keydown((state, data) => {
            expect(data).toEqual(keyEvent)
            done()
          })
        )
        document.onkeydown(keyEvent)
      })
    })
    describe("keyup", () => {
      it("should attach keyup listener", done => {
        const keyEvent = { key: "a", code: "KeyA" }
        const { dispatch } = withFx(app)({}, {}, dummyView)
        dispatch(
          keyup((state, data) => {
            expect(data).toEqual(keyEvent)
            done()
          })
        )
        document.onkeyup(keyEvent)
      })
    })
    describe("random", () => {
      it("should call random with default range", done => {
        const randomValue = 0.5
        const defaultRandom = Math.random
        Math.random = () => randomValue

        const { dispatch } = withFx(app)({}, {}, dummyView)
        dispatch(
          random((state, data) => {
            expect(data).toBeCloseTo(randomValue)
            done()
          })
        )

        Math.random = defaultRandom
      })

      it("should call random with custom range", done => {
        const defaultRandom = Math.random
        Math.random = () => 0.5

        const { dispatch } = withFx(app)({}, {}, dummyView)
        dispatch(
          random(
            (state, data) => {
              expect(data).toBeCloseTo(3.5)
              done()
            },
            // min
            2,
            // max
            5
          )
        )

        Math.random = defaultRandom
      })
    })
    describe("debounce", () => {
      it("should fire an action after a delay", () => {
        jest.useFakeTimers()
        try {
          const { dispatch } = withFx(app)({ count: 0 }, {}, dummyView)
          const up = (state, by) => ({ count: state.count + by })
          dispatch(debounce(1000, up, 2))
          expect(dispatch(getState)).toEqual({ count: 0 })
          jest.runAllTimers()
          expect(dispatch(getState)).toEqual({ count: 2 })
        } finally {
          jest.useRealTimers()
        }
      })
      it("should not execute an action until the delay has passed", () => {
        jest.useFakeTimers()
        try {
          const { dispatch } = withFx(app)({ count: 0 }, {}, dummyView)
          const actions = {
            up: (state, by) => ({ count: state.count + by })
          }

          jest.spyOn(actions, "up")
          dispatch(debounce(1000, actions.up, 2))
          expect(actions.up).toHaveBeenCalledTimes(0)
          expect(dispatch(getState)).toEqual({ count: 0 })
          jest.runAllTimers()
          expect(actions.up).toHaveBeenCalledTimes(1)
          expect(dispatch(getState)).toEqual({ count: 2 })
        } finally {
          jest.useRealTimers()
        }
      })
      it("should receive the data of the last attempted action call", () => {
        jest.useFakeTimers()
        try {
          const { dispatch } = withFx(app)({}, {}, dummyView)
          const set = (state, data) => data

          dispatch(debounce(1000, set, { data: "first" }))
          dispatch(debounce(1000, set, { data: "last" }))
          jest.runAllTimers()
          expect(dispatch(getState)).toEqual({ data: "last" })
        } finally {
          jest.useRealTimers()
        }
      })
    })
    describe("throttle", () => {
      it("should execute an action immediately", () => {
        const { dispatch } = withFx(app)({ count: 0 }, {}, dummyView)
        const up = (state, by) => ({ count: state.count + by })
        dispatch(throttle(1000, up, 2))
        expect(dispatch(getState)).toEqual({ count: 2 })
      })
      it("should only execute an action once within a limit", () => {
        jest.useFakeTimers()
        try {
          const { dispatch } = withFx(app)({}, {}, dummyView)
          const set = (state, data) => data

          dispatch(throttle(1000, set, { updated: "data" }))
          dispatch(throttle(1000, set, { updated: "again" }))
          expect(dispatch(getState)).toEqual({ updated: "data" })
          jest.runAllTimers()
          expect(dispatch(getState)).toEqual({ updated: "data" })
        } finally {
          jest.useRealTimers()
        }
      })
    })
    it("should log dispatched actions to console when logger enabled", done => {
      const defaultConsole = console
      console = {
        log() {},
        group() {},
        groupEnd() {
          done()
        }
      }
      const { dispatch } = withFx({ logger: true })(app)({}, {}, dummyView)

      dispatch({ count: 0 })

      console = defaultConsole
    })
  })
  describe("with strictMode option", () => {
    it("should throw error when calling wired actions from interop", () => {
      const main = withFx({ strictMode: true })(app)(
        {},
        {
          foo: {
            bar: () => ({})
          }
        },
        dummyView
      )

      expect(main.foo.bar).toThrow(
        "Still using wired action: 'foo.bar'. You need to refactor this before moving to Hyperapp 2.0."
      )
    })
    it("should throw error when omitting state and relying on shallow merge of state", () => {
      const { dispatch } = withFx({ strictMode: true })(app)(
        {
          foo: "bar",
          bar: "baz"
        },
        {},
        dummyView
      )

      expect(() => dispatch({ fizz: "buzz" })).toThrow(
        "New state will no longer be shallow-merged with existing state. The following state keys were ommited: 'foo, bar'. You need to refactor this before moving to Hyperapp 2.0."
      )
    })
  })
})
