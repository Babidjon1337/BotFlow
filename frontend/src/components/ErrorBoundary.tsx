import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: '#ff453a', fontFamily: 'sans-serif', backgroundColor: '#09090b', minHeight: '100vh' }}>
          <h2>Упс, что-то пошло не так.</h2>
          <p style={{ color: '#d4d4d8', marginBottom: '20px' }}>Приложение критически завершило работу из-за ошибки в коде. Сделайте скриншот этой страницы и отправьте разработчику.</p>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px', fontSize: '13px', color: '#a1a1aa' }}>
            <summary style={{ cursor: 'pointer', outline: 'none' }}>Показать детали ошибки</summary>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.error?.stack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
