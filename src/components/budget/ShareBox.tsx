import { useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { encodeScenario, type Scenario } from './scenario';

/** Explicit sharing: the URL carries the numbers only when this is opened and the link is used. */
export function ShareBox({ scenario }: { scenario: Scenario }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const url = open ? `${window.location.origin}${window.location.pathname}?${encodeScenario(scenario).toString()}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
    } catch {
      input.current?.select();
      setCopied('fail');
    }
  };
  return (
    <div className="share">
      <Button variant="outline" icon="arrowUpRight" aria-expanded={open} onClick={() => { setOpen((o) => !o); setCopied(null); }}>
        Share these numbers
      </Button>
      {open && (
        <div className="share__panel">
          <p>
            <strong>This link includes the numbers you entered</strong> — income, savings, rent, expenses and arrival costs — so anyone who opens it can see them. Your numbers are not in the page address unless you share this link.
          </p>
          <div className="share__row">
            <label className="sr-only" htmlFor="share-url">
              Link with your numbers
            </label>
            <input id="share-url" ref={input} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="primary" onClick={copy}>
              Copy link
            </Button>
          </div>
          <p className="share__status" role="status">
            {copied === 'ok' ? 'Link copied.' : copied === 'fail' ? 'Copy was blocked — the link is selected; press Ctrl/Cmd+C.' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
