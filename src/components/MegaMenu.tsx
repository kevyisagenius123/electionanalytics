import React from 'react';
import { Link } from 'react-router-dom';
import { PORTAL_ACCENT } from '../config/portalTheme';

const MegaMenu: React.FC = () => {
  return (
    <nav className="relative select-none" aria-label="Primary navigation">
      <ul className="flex items-center gap-4 m-0 p-0 list-none">
        <li>
          <Link
            to="/rustbelt-swing-3d"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium tracking-wide text-slate-300 hover:text-slate-100 focus:outline-none focus-visible:ring-2 transition-colors border border-transparent hover:border-slate-700"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PORTAL_ACCENT }} />
            US Swingometer
          </Link>
        </li>
        <li>
          <Link
            to="/canada-swing"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium tracking-wide text-slate-300 hover:text-slate-100 focus:outline-none focus-visible:ring-2 transition-colors border border-transparent hover:border-slate-700"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PORTAL_ACCENT }} />
            Canada Swingometer
          </Link>
        </li>
        <li>
          <Link
            to="/quebec-1995"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium tracking-wide text-slate-300 hover:text-slate-100 focus:outline-none focus-visible:ring-2 transition-colors border border-transparent hover:border-slate-700"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PORTAL_ACCENT }} />
            Quebec 1995
          </Link>
        </li>
      </ul>
    </nav>
  );
};

export default MegaMenu;
