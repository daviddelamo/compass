/* eslint-disable no-console */
const { expect } = require('chai');
const Enzyme = require('enzyme');
const Adapter = require('enzyme-adapter-react-16');
const jsdomGlobal = require('jsdom-global');
const m = require('module');
const React = require('react');
const { promisify } = require('util');

Enzyme.configure({ adapter: new Adapter() });
const mount = Enzyme.mount;

// Stub electron module for tests
const originalLoader = m._load;
const stubs = {
  electron: {
    ipcMain: {
      call: (methodName) => {
        console.log('electron.ipcMain.call main called!', methodName);
      },
      respondTo: (methodName) => {
        console.log('electron.ipcMain.respondTo main called!', methodName);
      },
      on: (methodName) => {
        console.log('electron.ipcMain.on main called!', methodName);
      }
    },
    remote: {
      app: {
        getName: () => 'Compass Connectivity Integration Test Suite',
        getPath: () => ''
      },
      dialog: {
        remote: {},
        BrowserWindow: {}
      }
    },
    shell: {}
  }
};
m._load = function hookedLoader(request, parent, isMain) {
  const stub = stubs[request];
  return stub || originalLoader(request, parent, isMain);
};

// Mock dom/window for tests.
// Has to come before @mongodb-js/compass-connect require.
jsdomGlobal();

const AppRegistry = require('hadron-app-registry');
const Connection = require('mongodb-connection-model');
const CompassConnectPlugin = require('@mongodb-js/compass-connect');
const CompassConnectComponent = CompassConnectPlugin.default;
const activateCompassConnect = CompassConnectPlugin.activate;

const deactivateCompassConnect = CompassConnectPlugin.deactivate;

const TEST_TIMEOUT_MS = require('./.mocharc.json').timeout;
const {
  dockerComposeDown,
  dockerComposeUp
} = require('./docker-instance-manager');

// Hide react warnings.
const originalWarn = console.warn.bind(console.warn);
console.warn = (msg) => (
  !msg.toString().includes('componentWillReceiveProps')
  && !msg.toString().includes('componentWillUpdate')
  && originalWarn(msg)
);

const delay = promisify(setTimeout);
const ensureConnected = async(timeout, testIsConnected) => {
  let connected = await testIsConnected();
  let timespentTesting = 0;
  while (!connected) {
    if (timeout > TEST_TIMEOUT_MS || timespentTesting > TEST_TIMEOUT_MS) {
      throw new Error('Waited for connection, never happened');
    }
    console.log(`Testing connectivity at timeout=${timeout}, connected=${connected}`);
    await delay(timeout);
    timespentTesting += timeout;
    timeout *= 2; // Try again but wait double.
    connected = await testIsConnected();
  }
  return connected;
};

const connectionsToTest = [{
  title: 'default local',
  model: {
    // hostname: 'localhost',
    // port: 27017,

    hosts: [{
      host: 'mongodb-rs-1',
      port: 28001
    }, {
      host: 'mongodb-rs-2',
      port: 28002
    }, {
      host: 'mongodb-rs-3',
      port: 28003
    }],
    replicaSet: 'replicaset',
    authStrategy: 'MONGODB',
    mongodbUsername: 'root',
    mongodbPassword: 'password123',
  },
  expectedInstanceDetails: {
    // host: ['client', 'db', getHostInfo],
    // build: ['client', 'db', getBuildInfo],
    genuineMongoDB: { isGenuine: true, dbType: 'mongodb' },
    dataLake: { isDataLake: false, version: null },

    databases: [], // Each database also collections array has which getHierarchy sets.

    collections: [],

    // Has totals for all dbs. keys with number values are 'document_count', 'storage_size', 'index_count', 'index_size'
    stats: {
      document_count: 3,
      storage_size: 123,
      index_count: 1,
      index_size: 123
    }
  }
}];

describe('Connectivity', () => {
  let appRegistry;
  let compassConnectStore;
  before(() => {
    dockerComposeUp();

    appRegistry = new AppRegistry();

    activateCompassConnect(appRegistry);

    global.hadronApp = {
      appRegistry
    };

    const ROLE = {
      name: 'Status',
      component: () => (<div id="statusPlugin">Status</div>)
    };
    global.hadronApp.appRegistry = appRegistry;
    global.hadronApp.appRegistry.registerRole('Application.Status', ROLE);

    compassConnectStore = appRegistry.getStore('Connect.Store');

    // Remove all logic around saving and loading stored connections.
    // NOTE: This is tightly coupled with the store in compass-connect.
    compassConnectStore._saveRecent = () => {};
    compassConnectStore._saveConnection = () => {};
    compassConnectStore.state.fetchedConnections = [];
    compassConnectStore.StatusActions = {
      done: () => {},
      showIndeterminateProgressBar: () => {}
    };
    compassConnectStore.appRegistry = appRegistry;
  });

  after(() => {
    deactivateCompassConnect(appRegistry);

    dockerComposeDown();
  });

  context('Connection can connect', () => {
    connectionsToTest.forEach(connection => {
      it('loads connection, connects, and loads instance information', async() => {
        // 1. Load the connection into our connection model.
        const model = new Connection(connection.model);
        console.log('Created model with connection string:', model.driverUrl);

        // 2. Load the connection model through compass-connect and render it.

        // Do we want to render it both in string view and connect form view.
        // Do we want to connect with both?
        // Here's where it uses the compass-connect store to decide:
        // https://github.com/mongodb-js/compass-connect/blob/master/src/stores/index.js#L325

        // This ensures the model doesn't cause any errors when rendering
        // and attempting to connect from there.

        // Load the connection into compass-connect's connection model.
        compassConnectStore.state.currentConnection = model;
        compassConnectStore.trigger(compassConnectStore.state);

        // Here we use the parsed connection model and build a url.
        // This is a bit hacky, but could be something that would occur if
        // a user is switching between the views and editing.
        compassConnectStore.state.customUrl = compassConnectStore.state.currentConnection.driverUrlWithSsh;
        compassConnectStore.trigger(compassConnectStore.state);

        let timesConnectedCalled = 0;
        let dataServiceConnected = false;
        let dataServiceConnectedErr;
        appRegistry.on('data-service-connected', (err) => {
          timesConnectedCalled++;
          dataServiceConnected = true;
          dataServiceConnectedErr = err;
        });

        // Simulate clicking connect.
        const wrapper = mount(<CompassConnectComponent />);
        wrapper.find({
          name: 'connect'
        }).simulate('click');

        expect(compassConnectStore.state.errorMessage).to.equal(null);
        expect(compassConnectStore.state.syntaxErrorMessage).to.equal(null);
        expect(compassConnectStore.state.isValid).to.equal(true);

        // 3. Wait for the connection event to occur.
        await ensureConnected(100, () => dataServiceConnected);

        if (dataServiceConnectedErr) {
          throw dataServiceConnectedErr;
        }

        if (timesConnectedCalled > 1) {
          throw new Error('data-service-connected called multiple times');
        }

        const dataService = compassConnectStore.dataService;

        // 4. Fetch the instance details using the new connection.
        const runFetchInstanceDetails = promisify(dataService.instance.bind(dataService));
        const instanceDetails = await runFetchInstanceDetails({});

        const runDisconnect = promisify(dataService.disconnect.bind(dataService));
        await runDisconnect();

        // 5. Ensure the connection details are what we expect.
        Object.keys(connection.expectedInstanceDetails).forEach(detailKey => {
          expect(instanceDetails[detailKey]).to.deep.equal(
            connection.expectedInstanceDetails[detailKey]
          );
        });
      });
    });
  });
});
