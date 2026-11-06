import { ref } from 'vue'

// Whether the server could be reached the last time something asked. Kept apart from useConnection (which listens to the phone's
// network and runs the health checks) so that small composables like useRemote can read it without pulling the plugins in.
export const reachable = ref(true)

/** The outcome of a request, from the API client. */
export const reportReachable = (reached: boolean) => (reachable.value = reached)
