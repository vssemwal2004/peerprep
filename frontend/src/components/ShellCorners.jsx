import useIsMobileNav from './useIsMobileNav';

// The app frame (sidebar, and the page header where there is one) is one seamless surface with no
// dividing lines; the page sits inside it like a sheet with curved corners. These two small
// pieces draw the inward curves where the page meets the frame: top-left (under the header, or at
// the top of the screen) and bottom-left. Desktop only: phones use the top bar instead.
const CORNER = 'pointer-events-none fixed z-[65] h-6 w-6 transition-[left,top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none';

export default function ShellCorners({ top = '0px' }) {
  const isMobileNav = useIsMobileNav();
  if (isMobileNav) return null;
  return (
    <>
      <span aria-hidden="true" data-shell-corner="top" className={`${CORNER} bg-[radial-gradient(circle_at_100%_100%,transparent_23.5px,var(--shell-frame)_24px)]`} style={{ left: 'var(--admin-sidebar-width)', top }} />
      <span aria-hidden="true" data-shell-corner="bottom" className={`${CORNER} bottom-0 bg-[radial-gradient(circle_at_100%_0%,transparent_23.5px,var(--shell-frame)_24px)]`} style={{ left: 'var(--admin-sidebar-width)' }} />
    </>
  );
}
