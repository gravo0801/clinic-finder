import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Panel error:', error, info)
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="panel-error-fallback">
          <strong>패널 오류가 발생했습니다</strong>
          <p>{this.state.error?.message || '잠시 후 다시 시도해주세요.'}</p>
          <button type="button" onClick={() => this.setState({ hasError: false, error: null })}>
            다시 시도
          </button>
          {this.props.onClose && (
            <button type="button" className="secondary" onClick={this.props.onClose}>
              닫기
            </button>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
