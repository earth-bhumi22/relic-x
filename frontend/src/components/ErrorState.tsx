// Owner: A (Arvind)
// Shows the backend's error shape (CONTRACT §4): `code` + `message`, with a retry button.
import { ApiError } from "../api/errors";

interface Props {
  error: ApiError | Error;
  onRetry?: () => void;
}

export default function ErrorState({ error, onRetry }: Props) {
  const code = error instanceof ApiError ? error.code : "client_error";
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">
        Something went wrong · <code>{code}</code>
      </p>
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
