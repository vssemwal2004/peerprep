import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function currentTenant() {
  return storage.getStore() || null;
}

export function runForTenant(tenant, work) {
  if (!tenant?.universityId || !tenant?.connection) throw new Error('A verified university connection is required');
  return storage.run(tenant, work);
}

export function runForPlatform(work) {
  return storage.run(null, work);
}

// Existing controllers import their models at module load time. Resolve each
// model against the verified request/job context instead of changing Mongoose's
// process-wide default connection, which would mix concurrent universities.
export function tenantModel(platformModel) {
  const resolve = () => {
    const tenant = currentTenant();
    if (!tenant) return platformModel;
    const connection = tenant.connection;
    return connection.models[platformModel.modelName]
      || connection.model(platformModel.modelName, platformModel.schema);
  };
  return new Proxy(platformModel, {
    get(_target, property) {
      const model = resolve();
      const value = Reflect.get(model, property, model);
      return typeof value === 'function' ? value.bind(model) : value;
    },
    set(_target, property, value) {
      return Reflect.set(resolve(), property, value);
    },
    apply(_target, _thisArg, args) {
      return resolve().apply(resolve(), args);
    },
    construct(_target, args) {
      const model = resolve();
      return Reflect.construct(model, args);
    },
  });
}
