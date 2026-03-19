interface ToastProps {
  message: string;
  type: 'success' | 'error';
}

export default function Toast({ message, type }: ToastProps) {
  return (
    <div className={`toast toast-${type}`}>
      {type === 'success' ? '✓' : '✗'} {message}
    </div>
  );
}
