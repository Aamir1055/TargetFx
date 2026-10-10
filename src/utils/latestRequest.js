// Each result, error, and loading update belongs to one request. Starting a
// newer request (or leaving its view) makes all older callbacks obsolete.
export const createLatestRequest = () => {
  let version = 0
  return {
    start() {
      const requestVersion = ++version
      return () => requestVersion === version
    },
    invalidate() { version += 1 }
  }
}
