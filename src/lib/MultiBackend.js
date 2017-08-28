export default class {
  constructor(manager, sourceOptions) {
    const options = {backends: []};
    const sourceOptionsDef = sourceOptions || {};
    for (const optionName in sourceOptionsDef) {
      if (Object.prototype.hasOwnProperty.call(sourceOptionsDef, optionName)) {
        options[optionName] = sourceOptionsDef[optionName];
      }
    }

    if (options.backends.length < 1) {
      throw new Error(
        `You must specify at least one Backend, if you are coming from 2.x.x (or don't understand this error)
        see this guide: https://github.com/louisbrunner/react-dnd-multi-backend/tree/next#migrating-from-2xx`
      );
    }

    this.current = 0;

    this.backends = [];
    for (const backend of options.backends) {
      if (!backend.backend) {
        throw new Error(`You must specify a 'backend' property in your Backend entry: ${backend}`);
      }
      const transition = backend.transition;
      if (transition && !transition._isMBTransition) {
        throw new Error(
          `You must specify a valid 'transition' property (either undefined or the return of 'createTransition') in your Backend entry: ${backend}`
        );
      }
      this.backends.push({
        instance: new backend.backend(manager),
        preview: (backend.preview || false),
        transition,
      });
    }

    this.nodes = {};
  }

  // DnD Backend API
  setup = () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.constructor.isSetUp) {
      throw new Error('Cannot have two MultiBackends at the same time.');
    }
    this.constructor.isSetUp = true;
    this.addEventListeners(window);
    this.backends[this.current].instance.setup();
  }

  teardown = () => {
    if (typeof window === 'undefined') {
      return;
    }

    this.constructor.isSetUp = false;
    this.removeEventListeners(window);
    this.backends[this.current].instance.teardown();
  }

  connectDragSource = (...args) => {
    return this.connectBackend('connectDragSource', args);
  }
  connectDragPreview = (...args) => {
    return this.connectBackend('connectDragPreview', args);
  }
  connectDropTarget = (...args) => {
    return this.connectBackend('connectDropTarget', args);
  }

  // Used by Preview component
  previewEnabled = () => {
    return this.backends[this.current].preview;
  }

  // Multi Backend Listeners
  addEventListeners = (target) => {
    for (const backend of this.backends) {
      if (backend.transition) {
        target.addEventListener(backend.transition.event, this.backendSwitcher, true);
      }
    }
  }

  removeEventListeners = (target) => {
    for (const backend of this.backends) {
      if (backend.transition) {
        target.removeEventListener(backend.transition.event, this.backendSwitcher, true);
      }
    }
  }

  // Switching logic
  backendSwitcher = (event) => {
    const oldBackend = this.current;

    let i = 0;
    for (const backend of this.backends) {
      if (i !== this.current && backend.transition && backend.transition.check(event)) {
        this.current = i;
        break;
      }
      i += 1;
    }

    if (this.current !== oldBackend) {
      this.backends[oldBackend].instance.teardown();
      for (const id of Object.keys(this.nodes)) {
        const node = this.nodes[id];
        node.handler();
        node.handler = this.callBackend(node.func, node.args);
      }
      this.backends[this.current].instance.setup();

      const newEvent = new event.constructor(event.type, event);
      event.target.dispatchEvent(newEvent);
    }
  }

  callBackend = (func, args) => {
    return this.backends[this.current].instance[func](...args);
  }

  connectBackend = (func, args) => {
    const nodeId = `${func}_${args[0]}`;
    const handler = this.callBackend(func, args);
    this.nodes[nodeId] = {func, args, handler};

    return (...subArgs) => {
      const r = this.nodes[nodeId].handler(...subArgs);
      delete this.nodes[nodeId];
      return r;
    };
  }
}
