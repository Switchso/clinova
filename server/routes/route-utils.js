export function route(method, matcher, options = {}) {
  return { method, matcher, ...options };
}

export function exact(path) {
  return (url) => url.pathname === path;
}

export function startsWith(prefix) {
  return (url) => url.pathname.startsWith(prefix);
}

export function matches(pattern) {
  return (url) => pattern.test(url.pathname);
}

export function resource(name) {
  return (url) => {
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[0] === "api" && parts[1] === name;
  };
}

export function routeMatches(routeDef, req, url) {
  return routeDef.method === req.method && routeDef.matcher(url);
}
