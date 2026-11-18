import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socketService from '../../utils/socket';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/CustomToast';
import { ACTION_TOASTS, announcePeerNetworkChange, canUsePeers, errorMessage, runPeerAction } from './peerNetwork';

/**
 * Mounted once in the student shell. Turns 'peer-network-updated' socket pushes into a window
 * event (counts and buttons refresh) and, for the student on the receiving end, a toast:
 * a Prep Mate request (with Accept / Decline) or an accepted request.
 */
export default function PeerRealtimeBridge() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const myId = String(user?._id || '');
  const enabled = canUsePeers(user);

  useEffect(() => {
    if (!enabled || !myId) return undefined;
    const onUpdate = (payload = {}) => {
      announcePeerNetworkChange(payload);
      const actor = payload.actor;
      if (!actor?.id || String(payload.targetId) !== myId || String(actor.id) === myId) return;
      const avatar = { name: actor.name, url: actor.avatarUrl };
      const openProfile = () => navigate(`/student/peers/${actor.id}`);
      if (payload.kind === 'mate-request' && payload.requestId) {
        const respond = (action) => async () => {
          try {
            await runPeerAction(action, { peerId: actor.id, requestId: payload.requestId });
            toast.show(ACTION_TOASTS[action](actor.name));
          } catch (error) {
            toast.error(errorMessage(error));
          }
        };
        toast.show({
          id: `mate-request:${payload.requestId}`,
          type: 'peer',
          avatar,
          title: 'Prep Mate request',
          message: `${actor.name} wants to be your Prep Mate.`,
          onClick: openProfile,
          actions: [
            { label: 'Accept', variant: 'primary', onClick: respond('accept') },
            { label: 'Decline', onClick: respond('decline') },
          ],
        });
      } else if (payload.kind === 'mate-accepted') {
        toast.show({ id: `mate-accepted:${payload.requestId}`, type: 'peer', avatar, title: 'New Prep Mate', message: `${actor.name} accepted your Prep Mate request.`, onClick: openProfile });
      }
    };
    socketService.on('peer-network-updated', onUpdate);
    return () => socketService.off('peer-network-updated', onUpdate);
  }, [enabled, myId, navigate, toast]);

  return null;
}
