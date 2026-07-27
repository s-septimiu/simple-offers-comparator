import { Component } from 'react'

/**
 * A calculator that renders a blank page on error is indistinguishable from a
 * broken deploy. Since nothing is persisted, reloading genuinely is a full
 * recovery — so say so rather than leaving the user staring at nothing.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="surface border rounded-xl p-6 max-w-lg">
          <h1 className="text-lg font-black ink mb-2">Something broke</h1>
          <p className="text-sm ink-2 leading-relaxed mb-4">
            The calculator hit an unexpected error. Nothing was saved anywhere, so reloading
            starts cleanly from the default offers.
          </p>
          <pre className="text-[11px] ink-3 whitespace-pre-wrap break-words mb-4 max-h-40 overflow-auto">
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <button
            onClick={() => {
              window.location.hash = ''
              window.location.reload()
            }}
            className="px-3 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
