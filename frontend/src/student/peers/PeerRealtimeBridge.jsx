import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import socketService from '../../utils/socket';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/CustomToast';
import { popupAllowedOn } from '../announcementPopupModel';
import {
  ACTION_TOASTS, announcePeerNetworkChange, canUsePeers, errorMessage, peerSubtitle,
  readSeenRequests, runPeerAction, unseenRequests, writeSeenRequests,
} from './peerNetwork';

const requestToastId = (requestId) => `mate-request:${requestId}`;
const SUMMARY_TOAST_ID = 'mate-requests:waiting';
// Let the page and any login popup settle before announcing requests that arrived while away.
const ARRIVAL_DELAY_MS = 1200;
const CLOSED_KINDS = new Set(['mate-cancelled', 'mate-declined', 'mate-accepted', 'mate-removed']);

/** A request toast with green Accept / red Decline that stays until answered or closed. */
function requestToast({ peer, requestId, title, toast, navigate }) {
  const respond = (action) => async () => {
    try {
      await runPeerAction(action, { peerId: peer.id, requestId });
      toast.show(ACTION_TOASTS[action](peer.name));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const detail = peerSubtitle(peer);
  return {
    id: requestToastId(requestId),
    type: 'peer',
    avatar: { name: peer.name, url: peer.avatarUrl },
    title,
    message: `${peer.name}${detail ? ` (${detail})` : ''} wants to be your Prep Mate.`,
    onClick: () => navigate(`/student/peers/${peer.id}`),
    duration: 0,
    actions: [
      { label: 'Accept', variant: 'accept', onClick: respond('accept') },
      { label: 'Decline', variant: 'decline', onClick: respond('decline') },
    ],
  };
}

/**
 * Mounted once in the student shell.
 * - Turns 'peer-network-updated' socket pushes into a window event (counts, lists and buttons
 *   everywhere refresh) and, for the student who received a request, a toast that stays until
 *   they act or close it. The toast closes itself if the request is withdrawn or answered elsewhere.
 * - When the student arrives (login / reload), requests that came in while they were away pop up
 *   once per browser: one request as a full toast, several as a "N requests waiting" toast.
 */
export default function PeerRealtimeBridge() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const myId = String(user?._id || '');
  const enabled = canUsePeers(user);
  const allowed = popupAllowedOn(pathname);
  const checkedFor = useRef('');

  useEffect(() => {
    if (!enabled || !myId) return undefined;
    const onUpdate = (payload = {}) => {
      announcePeerNetworkChange(payload);
      if (payload.requestId && CLOSED_KINDS.has(payload.kind)) toast.dismiss(requestToastId(payload.requestId));
      const actor = payload.actor;
      if (!actor?.id || String(payload.targetId) !== myId || String(actor.id) === myId) return;
      if (payload.kind === 'mate-request' && payload.requestId) {
        toast.dismiss(SUMMARY_TOAST_ID);
        toast.show(requestToast({ peer: actor, requestId: payload.requestId, title: 'New Prep Mate request', toast, navigate }));
        const seen = readSeenRequests(window.localStorage, myId);
        seen.add(String(payload.requestId));
        writeSeenRequests(window.localStorage, myId, seen);
      } else if (payload.kind === 'mate-nudge') {
        const practice = () => navigate('/problems');
        toast.show({
          id: `mate-nudge:${actor.id}`,
          type: 'peer',
          avatar: { name: actor.name, url: actor.avatarUrl },
          title: `${actor.name} sent you a Prep Ping`,
          message: 'Your Prep Mate is cheering for you. One problem today keeps your streak going.',
          onClick: practice,
          duration: 9000,
          actions: [{ label: 'Practice now', variant: 'primary', onClick: practice }],
        });
      } else if (payload.kind === 'mate-accepted') {
        toast.show({
          id: `mate-accepted:${payload.requestId}`,
          type: 'peer',
          avatar: { name: actor.name, url: actor.avatarUrl },
          title: 'New Prep Mate',
          message: `${actor.name} accepted your Prep Mate request. You are now Prep Mates.`,
          onClick: () => navigate(`/student/peers/${actor.id}`),
        });
      }
    };
    socketService.on('peer-network-updated', onUpdate);
    return () => socketService.off('peer-network-updated', onUpdate);
  }, [enabled, myId, navigate, toast]);

  // Requests that arrived while the student was away: announce once, on a page where popups are
  // allowed (never inside a test or an interview).
  useEffect(() => {
    if (!enabled || !myId || !allowed || checkedFor.current === myId) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      checkedFor.current = myId;
      try {
        const summary = await api.getPeerSummary();
        if (cancelled || !summary?.incomingRequests) return;
        const result = await api.getPeerNetwork('incoming');
        const items = result?.items || [];
        const seen = readSeenRequests(window.localStorage, myId);
        const fresh = unseenRequests(items, seen);
        if (cancelled || !fresh.length) return;
        fresh.forEach((peer) => seen.add(String(peer.relation.requestId)));
        writeSeenRequests(window.localStorage, myId, seen);
        if (items.length === 1) {
          toast.show(requestToast({ peer: fresh[0], requestId: fresh[0].relation.requestId, title: 'Prep Mate request waiting', toast, navigate }));
          return;
        }
        const names = items.slice(0, 2).map((peer) => String(peer.name || 'A classmate').split(' ')[0]);
        const others = items.length - names.length;
        const review = () => navigate('/student/peers?tab=incoming');
        toast.show({
          id: SUMMARY_TOAST_ID,
          type: 'peer',
          avatar: { name: items[0].name, url: items[0].avatarUrl },
          title: `${items.length} Prep Mate requests waiting`,
          message: `${names.join(', ')}${others > 0 ? ` and ${others} more` : ''} want to be your Prep Mates.`,
          onClick: review,
          duration: 0,
          actions: [{ label: 'Review requests', variant: 'primary', onClick: review }],
        });
      } catch {
        // Badges still show the requests; try the toast again on the next page.
        checkedFor.current = '';
      }
    }, ARRIVAL_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, myId, allowed, navigate, toast]);

  return null;
}
