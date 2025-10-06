import React from 'react';
import { PORTAL_ACCENT, PORTAL_ANNOUNCEMENT } from '../config/portalTheme';

interface Props { message?: string }

// Bottom announcement bar (optional usage). Styled to complement, not duplicate other portals.
const PortalBottomBar: React.FC<Props> = ({ message }) => {
  return (
    <div
      className="w-full text-white text-[13px] font-medium tracking-wide flex items-center justify-center py-3 px-4 mt-auto"
      style={{ backgroundColor: PORTAL_ACCENT }}
    >
      <span className="text-center">
        {message || PORTAL_ANNOUNCEMENT}
      </span>
    </div>
  );
};

export default PortalBottomBar;

