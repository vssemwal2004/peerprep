import Pair from '../models/Pair.js';
import SlotProposal from '../models/SlotProposal.js';
import Event from '../models/Event.js';
import User from '../models/User.js';
import { sendMail, buildICS, sendSlotProposalEmail, sendSlotAcceptanceEmail, sendInterviewScheduledEmail } from '../utils/mailer.js';
import { HttpError } from '../utils/errors.js';
import crypto from 'crypto';
import { logStudentActivity } from './activityController.js';

// Helper function to format date as "6/11/2025, 12:16:00 PM"
function formatDateTime(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

// Time window restrictions
const ALLOWED_START_HOUR = 10; // inclusive
const ALLOWED_END_HOUR = 22;  // exclusive

function isWithinAllowedHours(d) {
  if (!d) return false;
  const h = d.getHours();
  return h >= ALLOWED_START_HOUR && h < ALLOWED_END_HOUR;
}

function validateSlots(dates) {
  const now = Date.now();
  for (const d of dates) {
    if (d.getTime() <= now) throw new HttpError(400, 'Cannot use past time slot');
    if (!isWithinAllowedHours(d)) throw new HttpError(400, 'Slot must be between 10:00 and 22:00');
  }
}

// Generate a random future slot inside allowed window and within event boundaries (if any)
function generateRandomSlot(event) {
  const now = new Date();
  const startBoundary = event?.startDate ? new Date(event.startDate) : null;
  const endBoundary = event?.endDate ? new Date(event.endDate) : null;

  const base = startBoundary && startBoundary.getTime() > now.getTime() ? new Date(startBoundary) : new Date(now);
  base.setSeconds(0, 0);

  for (let i = 0; i < 50; i++) {
    const dayOffset = Math.floor(Math.random() * 7); // within next 7 days to avoid far future
    const d = new Date(base);
    d.setDate(d.getDate() + dayOffset);
    const hour = Math.floor(Math.random() * (ALLOWED_END_HOUR - ALLOWED_START_HOUR)) + ALLOWED_START_HOUR;
    const minute = Math.floor(Math.random() * 60);
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= now.getTime()) continue;
    if (!isWithinAllowedHours(d)) continue;
    if (startBoundary && d.getTime() < startBoundary.getTime()) continue;
    if (endBoundary && d.getTime() > endBoundary.getTime()) continue;
    return d;
  }
  // Fallback: next valid day start within window and boundaries
  let fallback = new Date(base);
  if (fallback.getHours() >= ALLOWED_END_HOUR) {
    fallback.setDate(fallback.getDate() + 1);
  }
  fallback.setHours(ALLOWED_START_HOUR, 0, 0, 0);
  if (startBoundary && fallback.getTime() < startBoundary.getTime()) fallback = new Date(startBoundary);
  if (fallback.getHours() < ALLOWED_START_HOUR) fallback.setHours(ALLOWED_START_HOUR, 0, 0, 0);
  if (fallback.getHours() >= ALLOWED_END_HOUR) {
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(ALLOWED_START_HOUR, 0, 0, 0);
  }
  if (endBoundary && fallback.getTime() > endBoundary.getTime()) {
    // As a last resort, just return endBoundary minus 1 hour if within window
    const end = new Date(endBoundary);
    end.setHours(Math.min(Math.max(ALLOWED_START_HOUR, end.getHours() - 1), ALLOWED_END_HOUR - 1), 0, 0, 0);
    return end;
  }
  return fallback;
}

async function checkAndAutoAssign(pair) {
  if (!pair) return false;
  if (pair.status === 'scheduled') return false;
  const ip = pair.interviewerProposalCount || 0;
  const ep = pair.intervieweeProposalCount || 0;
  // Auto-assign when combined attempts reach 6 (3 per person)
  const combined = ip + ep;
  if (combined < 6) return false;
  
  // Both hit limits; use the last submitted time as final
  // Get both users' proposals
  const interviewerDoc = await SlotProposal.findOne({ 
    pair: pair._id, 
    user: pair.interviewer, 
    event: pair.event 
  });
  const intervieweeDoc = await SlotProposal.findOne({ 
    pair: pair._id, 
    user: pair.interviewee, 
    event: pair.event 
  });
  
  // Find the most recently proposed slot (last submitted)
  let lastSlot = null;
  let lastSlotTime = 0;
  
  if (interviewerDoc?.slots?.length > 0 && interviewerDoc.updatedAt) {
    const slotTime = new Date(interviewerDoc.updatedAt).getTime();
    if (slotTime > lastSlotTime) {
      lastSlotTime = slotTime;
      lastSlot = interviewerDoc.slots[0];
    }
  }
  
  if (intervieweeDoc?.slots?.length > 0 && intervieweeDoc.updatedAt) {
    const slotTime = new Date(intervieweeDoc.updatedAt).getTime();
    if (slotTime > lastSlotTime) {
      lastSlotTime = slotTime;
      lastSlot = intervieweeDoc.slots[0];
    }
  }
  
  // If no valid last slot found, fall back to random slot generation
  if (!lastSlot || new Date(lastSlot).getTime() <= Date.now()) {
    const event = await Event.findById(pair.event);
    lastSlot = generateRandomSlot(event);
    if (!lastSlot || lastSlot.getTime() <= Date.now()) return false;
  }

  pair.scheduledAt = lastSlot;
  pair.finalConfirmedTime = lastSlot;
  pair.currentProposedTime = lastSlot;
  // Generate meeting link now since both parties have exhausted their proposals
  if (!pair.meetingLink) {
    const base = (process.env.MEETING_LINK_BASE || 'https://meet.jit.si').replace(/\/$/, '');
    const room = `Interview-${pair._id}-${crypto.randomBytes(3).toString('hex')}`;
    pair.meetingLink = `${base}/${room}`;
  }
  pair.status = 'scheduled';
  await pair.save();

  try {
    const populated = await Pair.findById(pair._id).populate('interviewer').populate('interviewee');
    const whenStr = formatDateTime(lastSlot);
    const emails = [populated?.interviewer?.email, populated?.interviewee?.email].filter(Boolean);
    
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
        <p style="margin-bottom:20px;">Dear Participant,</p>
        <p style="margin-bottom:16px;">The maximum of 3 combined proposals has been reached by both participants. Based on the most recently submitted proposal, your interview has been automatically scheduled.</p>
        
        <div style="background:#f0f9ff;padding:24px;border-radius:8px;border-left:4px solid #0ea5e9;margin:24px 0;">
          <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#0c4a6e;">✓ Interview Time Finalized</p>
          <p style="margin:0 0 8px 0;font-size:16px;font-weight:600;color:#0c4a6e;">${whenStr}</p>
          <p style="margin:12px 0 0 0;font-size:14px;color:#0c4a6e;"><strong>Meeting Link:</strong></p>
          <p style="margin:4px 0 0 0;font-size:14px;"><a href="${pair.meetingLink}" style="color:#0ea5e9;word-break:break-all;">${pair.meetingLink}</a></p>
        </div>
        
        <div style="background:#dbeafe;padding:16px;border-radius:6px;margin:24px 0;border-left:3px solid #3b82f6;">
          <p style="margin:0;font-size:14px;color:#1e3a8a;"><strong>📝 Important Reminders:</strong></p>
          <ul style="margin:8px 0 0 20px;padding:0;font-size:14px;color:#1e3a8a;">
            <li style="margin:6px 0;">Please mark this time in your calendar</li>
            <li style="margin:6px 0;">Join the meeting at least 5 minutes early</li>
            <li style="margin:6px 0;">Ensure your camera and microphone are working properly</li>
            <li style="margin:6px 0;">Have your preparation materials ready</li>
          </ul>
        </div>
        
        <p style="margin-top:28px;color:#64748b;font-size:14px;">We look forward to a successful interview session!</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
      </div>
    `;
    
    await Promise.all(emails.map(to => sendMail({
      to,
      subject: 'Interview Time Finalized - Details & Meeting Link',
      html
    }).catch(() => null)));
  } catch {}

  try {
    await sendMailForPair(pair);
  } catch (e) {
    console.error('[auto-assign] Failed to send scheduled emails:', e?.message);
  }
  return true;
}

async function expireProposalsIfNeeded(pair) {
  const now = Date.now();
  const users = [pair.interviewer, pair.interviewee];
  let movedSomething = false;
  for (const uid of users) {
    const doc = await SlotProposal.findOne({ pair: pair._id, user: uid, event: pair.event });
    if (!doc || !doc.slots?.length) continue;
    const latest = new Date(doc.slots[doc.slots.length - 1]).getTime();
    if (latest <= now) {
      const moved = doc.slots.pop();
      doc.pastSlots = doc.pastSlots || [];
      doc.pastEntries = doc.pastEntries || [];
      doc.pastSlots.push(moved);
      doc.pastEntries.push({ 
        time: moved, 
        reason: 'expired',
        proposedBy: uid,
        replacedAt: new Date()
      });
      await doc.save();
      movedSomething = true;
      try {
        // Notify both parties about expiration
        const populated = await Pair.findById(pair._id).populate('interviewer').populate('interviewee');
        const emails = [populated?.interviewer?.email, populated?.interviewee?.email].filter(Boolean);
        const whenStr = formatDateTime(moved);
        
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
            <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
              <!-- Header -->
              <div style="background:linear-gradient(135deg, #ef4444 0%, #f97316 100%);padding:32px 24px;text-align:center;">
                <div style="background:rgba(255,255,255,0.95);border-radius:50%;width:64px;height:64px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                  <span style="font-size:32px;">⏰</span>
                </div>
                <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Interview Time Expired</h1>
                <p style="margin:8px 0 0;color:rgba(255,255,255,0.95);font-size:14px;font-weight:500;">Action Required: New Proposal Needed</p>
              </div>
              
              <!-- Content -->
              <div style="padding:32px 24px;">
                <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">Dear Participant,</p>
                
                <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">
                  The previously proposed interview time has expired without being confirmed by both parties.
                </p>
                
                <!-- Expired Time Box -->
                <div style="background:linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);padding:20px;border-radius:12px;border:2px solid #fca5a5;margin:24px 0;box-shadow:0 2px 8px rgba(239,68,68,0.1);">
                  <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <div style="background:#fee2e2;border-radius:8px;padding:8px;">
                      <span style="font-size:20px;">🕐</span>
                    </div>
                    <div>
                      <p style="margin:0;font-size:12px;color:#991b1b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Expired Time</p>
                    </div>
                  </div>
                  <p style="margin:0;font-size:18px;font-weight:700;color:#7f1d1d;padding-left:44px;">${whenStr}</p>
                </div>
                
                <!-- Next Steps Box -->
                <div style="background:linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);padding:20px;border-radius:12px;border:2px solid #93c5fd;margin:24px 0;box-shadow:0 2px 8px rgba(59,130,246,0.1);">
                  <div style="display:flex;align-items:start;gap:12px;">
                    <div style="background:#bfdbfe;border-radius:8px;padding:8px;flex-shrink:0;">
                      <span style="font-size:20px;">📝</span>
                    </div>
                    <div style="flex:1;">
                      <p style="margin:0 0 8px;font-size:14px;color:#1e3a8a;font-weight:700;">Next Steps:</p>
                      <p style="margin:0;font-size:14px;color:#1e40af;line-height:1.5;">
                        Please log in to your dashboard and propose a new interview time that works for your schedule.
                      </p>
                    </div>
                  </div>
                </div>
                
                <!-- Call to Action -->
                <div style="text-align:center;margin:32px 0;">
                  <a href="#" style="display:inline-block;background:linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;box-shadow:0 4px 12px rgba(14,165,233,0.3);">
                    Go to Dashboard
                  </a>
                </div>
                
                <p style="margin:32px 0 0;color:#64748b;font-size:14px;line-height:1.6;">
                  Thank you for your prompt attention to scheduling your interview.
                </p>
              </div>
              
              <!-- Footer -->
              <div style="background:#f1f5f9;padding:24px;text-align:center;border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 4px;font-size:15px;color:#334155;font-weight:600;">Best regards,</p>
                <p style="margin:0;font-size:15px;color:#0ea5e9;font-weight:700;">PeerPrep Team</p>
                <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">This is an automated notification from the PeerPrep Interview System.</p>
              </div>
            </div>
          </body>
          </html>
        `;
        
        await Promise.all(emails.map(to => sendMail({
          to,
          subject: 'Interview Time Expired - New Proposal Required',
          html
        }).catch(() => null)));
      } catch {}
    }
  }
  if (movedSomething) {
    try { 
      await checkAndAutoAssign(pair); 
      
      // If both users have no active proposals left (all expired), schedule the last proposed time
      await checkAndScheduleLastProposal(pair);
    } catch {}
  }
}

// New function: Set default time when all proposals expire (requires both parties to confirm)
async function checkAndScheduleLastProposal(pair) {
  if (!pair) return false;
  if (pair.status === 'scheduled') return false;
  
  // Check if both users have no active proposals
  const interviewerDoc = await SlotProposal.findOne({ 
    pair: pair._id, 
    user: pair.interviewer, 
    event: pair.event 
  });
  const intervieweeDoc = await SlotProposal.findOne({ 
    pair: pair._id, 
    user: pair.interviewee, 
    event: pair.event 
  });
  
  const interviewerHasActive = interviewerDoc?.slots?.length > 0;
  const intervieweeHasActive = intervieweeDoc?.slots?.length > 0;
  
  // If either has active proposals, don't auto-set default time yet
  if (interviewerHasActive || intervieweeHasActive) return false;
  
  // Both have no active proposals - find the last proposed time from either user OR generate a new default time
  let defaultSlot = null;
  let lastSlotTime = 0;
  
  // Check interviewer's past proposals
  if (interviewerDoc?.pastEntries?.length > 0) {
    const lastEntry = interviewerDoc.pastEntries[interviewerDoc.pastEntries.length - 1];
    const slotTime = new Date(lastEntry.time).getTime();
    if (slotTime > lastSlotTime) {
      lastSlotTime = slotTime;
      defaultSlot = lastEntry.time;
    }
  }
  
  // Check interviewee's past proposals
  if (intervieweeDoc?.pastEntries?.length > 0) {
    const lastEntry = intervieweeDoc.pastEntries[intervieweeDoc.pastEntries.length - 1];
    const slotTime = new Date(lastEntry.time).getTime();
    if (slotTime > lastSlotTime) {
      lastSlotTime = slotTime;
      defaultSlot = lastEntry.time;
    }
  }
  
  // If no last slot found, generate a random future slot as default
  if (!defaultSlot || new Date(defaultSlot).getTime() <= Date.now()) {
    const event = await Event.findById(pair.event);
    defaultSlot = generateRandomSlot(event);
    if (!defaultSlot || defaultSlot.getTime() <= Date.now()) return false;
  }
  
  // Set the default time as a proposal for BOTH parties to review and confirm
  // This creates an active slot in both users' proposals that they must explicitly accept
  if (!interviewerDoc) {
    const newDoc = new SlotProposal({ 
      pair: pair._id, 
      user: pair.interviewer, 
      event: pair.event, 
      slots: [defaultSlot],
      pastSlots: [],
      pastEntries: []
    });
    await newDoc.save();
  } else {
    interviewerDoc.slots = [defaultSlot];
    await interviewerDoc.save();
  }
  
  if (!intervieweeDoc) {
    const newDoc = new SlotProposal({ 
      pair: pair._id, 
      user: pair.interviewee, 
      event: pair.event, 
      slots: [defaultSlot],
      pastSlots: [],
      pastEntries: []
    });
    await newDoc.save();
  } else {
    intervieweeDoc.slots = [defaultSlot];
    await intervieweeDoc.save();
  }
  
  // Update pair with the default proposed time but keep status as pending
  pair.currentProposedTime = defaultSlot;
  // DO NOT set scheduledAt or finalConfirmedTime yet - only after both confirm
  // DO NOT generate meeting link - only after both parties confirm
  pair.status = 'pending'; // Keep as pending until both parties confirm
  await pair.save();
  
  // Send professional notification about the automatically set default time
  try {
    const populated = await Pair.findById(pair._id).populate('interviewer').populate('interviewee');
    const whenStr = formatDateTime(defaultSlot);
    const emails = [populated?.interviewer?.email, populated?.interviewee?.email].filter(Boolean);
    
    const html = `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
        <p style="margin-bottom:20px;">Dear Participant,</p>
        <p style="margin-bottom:16px;">Since all previously proposed interview times have expired, the system has automatically set a default time based on the most recent proposals.</p>
        
        <div style="background:#fef3c7;padding:24px;border-radius:8px;border-left:4px solid #f59e0b;margin:24px 0;">
          <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#78350f;">📅 Automatically Set Default Time</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#78350f;">${whenStr}</p>
        </div>
        
        <div style="background:#dbeafe;padding:16px;border-radius:6px;margin:24px 0;border-left:3px solid #3b82f6;">
          <p style="margin:0;font-size:14px;color:#1e3a8a;"><strong>📝 Action Required - Both Parties Must Confirm:</strong></p>
          <ul style="margin:8px 0 0 20px;padding:0;font-size:14px;color:#1e3a8a;">
            <li style="margin:6px 0;">Please log in to your dashboard to review this time</li>
            <li style="margin:6px 0;">If this time works for you, <strong>accept it to confirm</strong></li>
            <li style="margin:6px 0;">If this time doesn't work, propose an alternative time</li>
            <li style="margin:6px 0;"><strong>The interview will only be scheduled after both parties confirm</strong></li>
          </ul>
        </div>
        
        <div style="background:#f1f5f9;padding:16px;border-radius:6px;margin:24px 0;">
          <p style="margin:0;font-size:14px;color:#475569;"><strong>ℹ️ Important:</strong> This is a proposed time only. The meeting link will be provided once both parties have confirmed and accepted this time.</p>
        </div>
        
        <p style="margin-top:28px;color:#64748b;font-size:14px;">Please respond at your earliest convenience to finalize the interview schedule.</p>
        <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
      </div>
    `;
    
    await Promise.all(emails.map(to => sendMail({
      to,
      subject: 'Default Interview Time Set - Confirmation Required',
      html
    }).catch(() => null)));
  } catch {}
  
  console.log(`[checkAndScheduleLastProposal] Default time set for pair ${pair._id}: ${formatDateTime(defaultSlot)} (requires both parties to confirm)`);
  return true;
}

// Helper to check user's role in a pair (all pairs use User IDs)
async function getUserRoleInPair(pair, user) {
  const userId = user._id.toString();
  
  // Handle both populated objects and ObjectId references
  const interviewerId = pair.interviewer?._id ? pair.interviewer._id.toString() : pair.interviewer?.toString();
  const intervieweeId = pair.interviewee?._id ? pair.interviewee._id.toString() : pair.interviewee?.toString();
  
  if (!interviewerId || !intervieweeId) {
    console.error('[getUserRoleInPair] Pair missing interviewer or interviewee:', { 
      pairId: pair._id, 
      hasInterviewer: !!pair.interviewer, 
      hasInterviewee: !!pair.interviewee 
    });
    return { isInPair: false, isInterviewer: null, effectiveUserId: null };
  }
  
  // Direct ID match only
  if (userId === interviewerId) {
    return { isInPair: true, isInterviewer: true, effectiveUserId: userId };
  }
  if (userId === intervieweeId) {
    return { isInPair: true, isInterviewer: false, effectiveUserId: userId };
  }

  return { isInPair: false, isInterviewer: null, effectiveUserId: null };
}

export async function proposeSlots(req, res) {
  let pair = await Pair.findById(req.params.pairId);
  if (!pair) throw new HttpError(404, 'Pair not found');
  
  // Get event (for date boundaries only)
  const event = await Event.findById(pair.event);
  
  // Store the raw IDs before population attempt
  const rawInterviewerId = pair.interviewer;
  const rawIntervieweeId = pair.interviewee;
  
  // Try to populate from User model
  pair = await Pair.findById(req.params.pairId)
    .populate('interviewer')
    .populate('interviewee');
  
  if (!pair.interviewer || !pair.interviewer._id) {
    console.log('[proposeSlots] Manually fetching interviewer from User');
    pair.interviewer = await User.findById(rawInterviewerId);
  }
  if (!pair.interviewee || !pair.interviewee._id) {
    console.log('[proposeSlots] Manually fetching interviewee from User');
    pair.interviewee = await User.findById(rawIntervieweeId);
  }
  // Expire any passed active proposals before proceeding
  await expireProposalsIfNeeded(pair);
  
  // Check if user is part of this pair (handles cross-collection matching)
  const userRole = await getUserRoleInPair(pair, req.user);
  if (!userRole.isInPair) throw new HttpError(403, 'Not your pair');
  
  const { slots } = req.body || {}; // array of ISO strings (optional)
  const isInterviewer = userRole.isInterviewer;
  const effectiveUserId = userRole.effectiveUserId;
  const partnerId = isInterviewer ? pair.interviewee?._id : pair.interviewer?._id;

  // If already scheduled, disallow any further modifications to slots.
  if (pair.status === 'scheduled') {
    if (slots && slots.length > 0) throw new HttpError(400, 'Pair already scheduled; slots can no longer be changed');
    // Read-only fetch still allowed below when no slots provided
  }

  // If no slots provided, return current proposals (read-only for both roles)
  if (!slots || slots.length === 0) {
    const mineDoc = await SlotProposal.findOne({ pair: pair._id, user: effectiveUserId, event: pair.event })
      .populate('pastEntries.proposedBy', 'name email')
      .populate('pastEntries.replacedBy', 'name email');
    const partnerDoc = await SlotProposal.findOne({ pair: pair._id, user: partnerId, event: pair.event })
      .populate('pastEntries.proposedBy', 'name email')
      .populate('pastEntries.replacedBy', 'name email');
    const mine = (mineDoc?.slots || []).map(d => new Date(d).toISOString());
    const partner = (partnerDoc?.slots || []).map(d => new Date(d).toISOString());
    const mineUpdatedAt = mineDoc?.updatedAt ? new Date(mineDoc.updatedAt).toISOString() : null;
    const partnerUpdatedAt = partnerDoc?.updatedAt ? new Date(partnerDoc.updatedAt).toISOString() : null;
    const minePast = (mineDoc?.pastSlots || []).map(d => new Date(d).toISOString());
    const partnerPast = (partnerDoc?.pastSlots || []).map(d => new Date(d).toISOString());
    
    // Include rich past entries with reasons and user info for UI display
    const minePastEntries = (mineDoc?.pastEntries || []).map(e => ({
      time: new Date(e.time).toISOString(),
      reason: e.reason,
      proposedBy: e.proposedBy ? { name: e.proposedBy.name, email: e.proposedBy.email, _id: e.proposedBy._id } : null,
      replacedBy: e.replacedBy ? { name: e.replacedBy.name, email: e.replacedBy.email, _id: e.replacedBy._id } : null,
      replacedAt: e.replacedAt ? new Date(e.replacedAt).toISOString() : null,
      source: 'mine' // Mark as coming from current user's proposals
    }));
    const partnerPastEntries = (partnerDoc?.pastEntries || []).map(e => ({
      time: new Date(e.time).toISOString(),
      reason: e.reason,
      proposedBy: e.proposedBy ? { name: e.proposedBy.name, email: e.proposedBy.email, _id: e.proposedBy._id } : null,
      replacedBy: e.replacedBy ? { name: e.replacedBy.name, email: e.replacedBy.email, _id: e.replacedBy._id } : null,
      replacedAt: e.replacedAt ? new Date(e.replacedAt).toISOString() : null,
      source: 'partner' // Mark as coming from partner's proposals
    }));
    
    // find first common
    const partnerSet = new Set(partner.map(d => new Date(d).getTime()));
    const common = mine.map(d => new Date(d).getTime()).find(t => partnerSet.has(t));
    return res.json({ 
      mine, 
      partner, 
      minePast, 
      partnerPast, 
      minePastEntries,
      partnerPastEntries,
      common: common ? new Date(common).toISOString() : null,
      mineUpdatedAt,
      partnerUpdatedAt
    });
  }

  // Validate slots within event window
  let startBoundary = event?.startDate ? new Date(event.startDate).getTime() : null;
  let endBoundary = event?.endDate ? new Date(event.endDate).getTime() : null;
  const dates = (slots || []).map((s) => new Date(s));
  if (dates.some(d => isNaN(d.getTime()))) throw new HttpError(400, 'Invalid slot date');
  // Accept exactly one active slot per proposal
  if (dates.length !== 1) throw new HttpError(400, 'Provide exactly one slot');
  // Time-of-day + future validation
  validateSlots(dates);
  if (startBoundary && dates.some(d => d.getTime() < startBoundary)) throw new HttpError(400, 'Slot before event start');
  if (endBoundary && dates.some(d => d.getTime() > endBoundary)) throw new HttpError(400, 'Slot after event end');

  // Allow replacing existing proposal - move old proposal to pastSlots and pastEntries
  let doc = await SlotProposal.findOne({ pair: pair._id, user: effectiveUserId, event: pair.event });
  const hadPreviousProposal = doc?.slots?.length > 0;
  
  // Check current combined proposal count BEFORE incrementing
  const currentCombinedCount = (pair.interviewerProposalCount || 0) + (pair.intervieweeProposalCount || 0);
  
  // Prevent proposals if already at 6 (scheduled state should have caught this earlier)
  if (currentCombinedCount >= 6) throw new HttpError(400, 'Maximum of 6 combined proposals reached');
  
  if (!doc) doc = new SlotProposal({ pair: pair._id, user: effectiveUserId, event: pair.event, slots: [], pastSlots: [], pastEntries: [] });
  
  // Move old proposal to pastSlots and pastEntries with 'superseded' reason before replacing
  if (hadPreviousProposal) {
    doc.pastSlots = [...(doc.pastSlots || []), ...doc.slots];
    // Add to pastEntries with 'superseded' reason
    if (!doc.pastEntries) doc.pastEntries = [];
    for (const oldSlot of doc.slots) {
      doc.pastEntries.push({
        time: oldSlot,
        reason: 'superseded',
        proposedBy: effectiveUserId,
        replacedBy: effectiveUserId,
        replacedAt: new Date()
      });
    }
  }
  
  doc.slots = [dates[0]];
  await doc.save();
  
  // Debug: Log what was saved
  console.log('[Propose] User', effectiveUserId, 'saved slot:', dates[0].toISOString());
  
  // Increment per-user counters on pair (count every attempt, including replacements)
  const isInterviewerProposing = isInterviewer;
  if (isInterviewerProposing) pair.interviewerProposalCount = (pair.interviewerProposalCount || 0) + 1; 
  else pair.intervieweeProposalCount = (pair.intervieweeProposalCount || 0) + 1;

  // Update unified currentProposedTime on pair always (default or latest user proposal)
  pair.currentProposedTime = dates[0];
  
  // Check if this is the 6th proposal - if so, AUTO-SCHEDULE immediately
  const newCombinedCount = (pair.interviewerProposalCount || 0) + (pair.intervieweeProposalCount || 0);
  if (newCombinedCount >= 6 && pair.status !== 'scheduled') {
    console.log('[Propose] 6th proposal reached - auto-scheduling interview');
    pair.scheduledAt = dates[0];
    pair.finalConfirmedTime = dates[0];
    pair.status = 'scheduled';
    
    // Auto-generate Jitsi meeting link
    if (!pair.meetingLink) {
      const base = (process.env.MEETING_LINK_BASE || 'https://meet.jit.si').replace(/\/$/, '');
      const room = `Interview-${pair._id}-${crypto.randomBytes(3).toString('hex')}`;
      pair.meetingLink = `${base}/${room}`;
    }
    
    // Log activity for both participants
    await logStudentActivity({
      studentId: effectiveUserId,
      studentModel: 'User',
      activityType: 'SESSION_SCHEDULED',
      metadata: {
        pairId: pair._id,
        eventId: pair.event,
        scheduledAt: dates[0],
        role: isInterviewer ? 'interviewer' : 'interviewee',
        autoScheduled: true
      }
    });
  }
  
  await pair.save();

  // Send email notifications
  const justScheduled = newCombinedCount >= 6 && pair.status === 'scheduled';
  
  if (justScheduled) {
    // Send final scheduled emails to both parties
    await sendMailForPair(pair);
    console.log('[Propose] 6th proposal - interview auto-scheduled and emails sent');
  } else if (isInterviewerProposing && pair.interviewee?.email) {
    // Interviewer proposed slots -> notify interviewee
    const slotsList = dates.map(d => formatDateTime(d)).join(' | '); // Use | as separator to avoid comma conflict
    await sendSlotProposalEmail({
      to: pair.interviewee.email,
      interviewer: pair.interviewer?.name || pair.interviewer?.email || 'Your interviewer',
      slot: slotsList,
    });
    console.log(`[Email] Slot proposal sent to interviewee: ${pair.interviewee.email}`);
  } else if (!isInterviewerProposing && pair.interviewer?.email) {
    // Interviewee proposed alternative slots -> notify interviewer
    const slotsList = dates.map(d => formatDateTime(d)).join(' | '); // Use | as separator to avoid comma conflict
    await sendSlotAcceptanceEmail({
      to: pair.interviewer.email,
      interviewee: pair.interviewee?.name || pair.interviewee?.email || 'The interviewee',
      slot: slotsList,
      accepted: false, // This is a new proposal, not acceptance
    });
    console.log(`[Email] New slot proposal sent to interviewer: ${pair.interviewer.email}`);
  }

  // Return both proposals and intersection with populated user info
  const mineDoc = await SlotProposal.findOne({ pair: pair._id, user: effectiveUserId, event: pair.event })
    .populate('pastEntries.proposedBy', 'name email')
    .populate('pastEntries.replacedBy', 'name email');
  const partnerDoc = await SlotProposal.findOne({ pair: pair._id, user: partnerId, event: pair.event })
    .populate('pastEntries.proposedBy', 'name email')
    .populate('pastEntries.replacedBy', 'name email');
  // Mark expired slots
  const nowTs = Date.now();
  const mineSlotsRaw = (mineDoc?.slots || []).map(d => new Date(d));
  const partnerSlotsRaw = (partnerDoc?.slots || []).map(d => new Date(d));
  const mine = mineSlotsRaw.map(d => d.toISOString());
  const partner = partnerSlotsRaw.map(d => d.toISOString());
  
  // Debug: Log what's being returned
  console.log('[Propose] Returning mine:', mine);
  console.log('[Propose] Returning partner:', partner);
  
  const minePast = (mineDoc?.pastSlots || []).map(d => new Date(d).toISOString());
  const partnerPast = (partnerDoc?.pastSlots || []).map(d => new Date(d).toISOString());
  const minePastEntries = (mineDoc?.pastEntries || []).map(e => ({ 
    time: new Date(e.time).toISOString(), 
    reason: e.reason,
    proposedBy: e.proposedBy ? { name: e.proposedBy.name, email: e.proposedBy.email, _id: e.proposedBy._id } : null,
    replacedBy: e.replacedBy ? { name: e.replacedBy.name, email: e.replacedBy.email, _id: e.replacedBy._id } : null,
    replacedAt: e.replacedAt ? new Date(e.replacedAt).toISOString() : null,
    source: 'mine'
  }));
  const partnerPastEntries = (partnerDoc?.pastEntries || []).map(e => ({ 
    time: new Date(e.time).toISOString(), 
    reason: e.reason,
    proposedBy: e.proposedBy ? { name: e.proposedBy.name, email: e.proposedBy.email, _id: e.proposedBy._id } : null,
    replacedBy: e.replacedBy ? { name: e.replacedBy.name, email: e.replacedBy.email, _id: e.replacedBy._id } : null,
    replacedAt: e.replacedAt ? new Date(e.replacedAt).toISOString() : null,
    source: 'partner'
  }));
  const pastTimeSlots = [...minePastEntries, ...partnerPastEntries]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const mineMeta = mineSlotsRaw.map(d => ({ slot: d.toISOString(), expired: d.getTime() <= nowTs }));
  const partnerMeta = partnerSlotsRaw.map(d => ({ slot: d.toISOString(), expired: d.getTime() <= nowTs }));
  const mineUpdatedAt = mineDoc?.updatedAt ? new Date(mineDoc.updatedAt).toISOString() : null;
  const partnerUpdatedAt = partnerDoc?.updatedAt ? new Date(partnerDoc.updatedAt).toISOString() : null;
  const partnerSet = new Set(partner.map(d => new Date(d).getTime()));
  const common = mine.map(d => new Date(d).getTime()).find(t => partnerSet.has(t) && t > nowTs);
  // Include unified currentProposedTime for frontend immediate sync
  const freshPair = await Pair.findById(pair._id).lean();
  res.json({ 
    mine, 
    partner, 
    minePast, 
    partnerPast, 
    minePastEntries, 
    partnerPastEntries, 
    pastTimeSlots, 
    common: common ? new Date(common).toISOString() : null, 
    mineMeta, 
    partnerMeta, 
    mineUpdatedAt,
    partnerUpdatedAt,
    currentProposedTime: freshPair?.currentProposedTime ? new Date(freshPair.currentProposedTime).toISOString() : null,
    status: freshPair?.status || 'pending',
    scheduledAt: freshPair?.scheduledAt ? new Date(freshPair.scheduledAt).toISOString() : null,
    interviewerProposalCount: freshPair?.interviewerProposalCount || 0,
    intervieweeProposalCount: freshPair?.intervieweeProposalCount || 0
  });
}

export async function confirmSlot(req, res) {
  let pair = await Pair.findById(req.params.pairId);
  if (!pair) throw new HttpError(404, 'Pair not found');
  
  // Get event (for date boundaries only)
  const event = await Event.findById(pair.event);
  
  // Store the raw IDs before population attempt
  const rawInterviewerId = pair.interviewer;
  const rawIntervieweeId = pair.interviewee;
  
  // Try to populate from User model
  pair = await Pair.findById(req.params.pairId)
    .populate('interviewer')
    .populate('interviewee');
  
  if (!pair.interviewer || !pair.interviewer._id) {
    pair.interviewer = await User.findById(rawInterviewerId);
  }
  if (!pair.interviewee || !pair.interviewee._id) {
    pair.interviewee = await User.findById(rawIntervieweeId);
  }
  
  // Check if user is part of this pair (handles cross-collection matching)
  const userRole = await getUserRoleInPair(pair, req.user);
  if (!userRole.isInPair) throw new HttpError(403, 'Not your pair');
  
  // Rule: Either party may confirm, but the chosen time must exist in the OTHER party's proposals.
  const confirmerIsInterviewee = !userRole.isInterviewer;
  const confirmerIsInterviewer = userRole.isInterviewer;
  if (!confirmerIsInterviewee && !confirmerIsInterviewer) throw new HttpError(403, 'Only pair participants can confirm the meeting time');

  if (pair.status === 'scheduled') throw new HttpError(400, 'Pair already scheduled; confirmation cannot be changed');

  const { scheduledAt, meetingLink } = req.body;
  const scheduled = new Date(scheduledAt);
  if (isNaN(scheduled.getTime())) throw new HttpError(400, 'Invalid scheduledAt');
  if (scheduled.getTime() <= Date.now()) throw new HttpError(400, 'Cannot confirm past time');
  if (!isWithinAllowedHours(scheduled)) throw new HttpError(400, 'Scheduled time must be between 10:00 and 22:00');

  // Check if this is confirming the default time slot
  const isConfirmingDefault = pair.defaultTimeSlot && 
    Math.abs(new Date(pair.defaultTimeSlot).getTime() - scheduled.getTime()) < 60000; // Within 1 minute

  if (!isConfirmingDefault) {
    // For non-default confirmations, validate the time exists in the OTHER party's proposals
    const otherUserId = confirmerIsInterviewer ? pair.interviewee?._id : pair.interviewer?._id;
    const otherProposal = await SlotProposal.findOne({ pair: pair._id, user: otherUserId, event: pair.event });
    if (!otherProposal || !otherProposal.slots?.length) {
      throw new HttpError(400, 'No slots proposed by the other party to confirm');
    }
    const latest = otherProposal.slots[otherProposal.slots.length - 1];
    if (!latest || new Date(latest).getTime() !== scheduled.getTime()) {
      throw new HttpError(400, 'Only the latest proposed time can be confirmed');
    }
  }

  // Enforce event window on confirmation too
  if (event?.startDate && scheduled.getTime() < new Date(event.startDate).getTime()) throw new HttpError(400, 'Scheduled time before event start');
  if (event?.endDate && scheduled.getTime() > new Date(event.endDate).getTime()) throw new HttpError(400, 'Scheduled time after event end');

  pair.scheduledAt = scheduled;
  pair.finalConfirmedTime = scheduled;
  pair.currentProposedTime = scheduled; // New line added
  // Auto-generate a Jitsi meet link if none provided yet.
  if (meetingLink) {
    pair.meetingLink = meetingLink;
  } else if (!pair.meetingLink) {
    const base = (process.env.MEETING_LINK_BASE || 'https://meet.jit.si').replace(/\/$/, '');
    const room = `Interview-${pair._id}-${crypto.randomBytes(3).toString('hex')}`; // 6 hex chars
    pair.meetingLink = `${base}/${room}`;
  }
  pair.status = 'scheduled';
  await pair.save();

  // Log session scheduled activity for both participants (always User model)
  await logStudentActivity({
    studentId: req.user._id,
    studentModel: 'User',
    activityType: 'SESSION_SCHEDULED',
    metadata: {
      pairId: pair._id,
      eventId: pair.event,
      scheduledAt: scheduled,
      role: confirmerIsInterviewer ? 'interviewer' : 'interviewee'
    }
  });

  // If both reached max attempts and still not scheduled, auto-assign
  try { await checkAndAutoAssign(pair); } catch {}
  
  // Send acceptance notification to the other party
  // Always send slot acceptance emails (part of the 4-email flow)
  if (confirmerIsInterviewee && pair.interviewer?.email) {
    // Interviewee accepted interviewer's proposed slot
    await sendSlotAcceptanceEmail({
      to: pair.interviewer.email,
      interviewee: pair.interviewee?.name || pair.interviewee?.email || 'The interviewee',
      slot: formatDateTime(scheduled),
      accepted: true,
    });
    console.log(`[Email] Slot acceptance sent to interviewer: ${pair.interviewer.email}`);
  } else if (confirmerIsInterviewer && pair.interviewee?.email) {
    // Interviewer confirmed interviewee's proposed slot
    await sendSlotAcceptanceEmail({
      to: pair.interviewee.email,
      interviewee: pair.interviewer?.name || pair.interviewer?.email || 'Your interviewer',
      slot: formatDateTime(scheduled),
      accepted: true,
    });
    console.log(`[Email] Slot confirmation sent to interviewee: ${pair.interviewee.email}`);
  }
  
  // notify both with interview scheduled email
  await sendMailForPair(pair);
  res.json(pair);
}

export async function rejectSlots(req, res) {
  let pair = await Pair.findById(req.params.pairId);
  if (!pair) throw new HttpError(404, 'Pair not found');
  
  // Get event (for date boundaries only)
  const event = await Event.findById(pair.event);
  
  // Store the raw IDs before population attempt
  const rawInterviewerId = pair.interviewer;
  const rawIntervieweeId = pair.interviewee;
  
  // Try to populate from User model
  pair = await Pair.findById(req.params.pairId)
    .populate('interviewer')
    .populate('interviewee');
  
  if (!pair.interviewer || !pair.interviewer._id) {
    pair.interviewer = await User.findById(rawInterviewerId);
  }
  if (!pair.interviewee || !pair.interviewee._id) {
    pair.interviewee = await User.findById(rawIntervieweeId);
  }
  
  if (pair.status === 'scheduled') throw new HttpError(400, 'Pair already scheduled; cannot reject now');
  
  // Move any expired latest proposals to past first to ensure UI reflects past entries
  try { await expireProposalsIfNeeded(pair); } catch {}
  
  // Either party can reject the other party's latest proposed time
  const userRole = await getUserRoleInPair(pair, req.user);
  if (!userRole.isInPair) throw new HttpError(403, 'Not your pair');
  const otherUserId = userRole.isInterviewer ? pair.interviewee?._id : pair.interviewer?._id;
  const otherDoc = await SlotProposal.findOne({ pair: pair._id, user: otherUserId, event: pair.event });
  if (!otherDoc || !otherDoc.slots?.length) {
    // Nothing to reject (likely already expired and moved to past). Return success message for smoother UX.
    return res.json({ message: 'No pending proposal to reject. Any expired times have been moved to Past Time Slots.' });
  }
  const latest = otherDoc.slots.pop();
  otherDoc.pastSlots = otherDoc.pastSlots || [];
  otherDoc.pastSlots.push(latest);
  otherDoc.pastEntries = otherDoc.pastEntries || [];
  otherDoc.pastEntries.push({ 
    time: latest, 
    reason: 'rejected',
    proposedBy: otherUserId,
    replacedBy: effectiveUserId,
    replacedAt: new Date()
  });
  await otherDoc.save();
  
  const { reason } = req.body || {};
  // Track pair rejection info (throttling removed per new flow)
  pair.rejectionCount = (pair.rejectionCount || 0) + 1;
  pair.lastRejectedAt = new Date();
  pair.rejectionHistory = pair.rejectionHistory || [];
  pair.rejectionHistory.push({ at: new Date(), reason: reason || '' });
  await pair.save();
  
  // In case both have hit their limits, auto-assign
  try {
    const auto = await checkAndAutoAssign(pair);
    if (auto) {
      return res.json({ message: 'Maximum of 3 combined proposals reached. A time was auto-assigned.' });
    }
  } catch {}
  
  // Notify the proposer that their slot was rejected
  const notifyEmail = userRole.isInterviewer ? pair.interviewee?.email : pair.interviewer?.email;
  const rejectorName = userRole.isInterviewer ? (pair.interviewer?.name || pair.interviewer?.email) : (pair.interviewee?.name || pair.interviewee?.email);
  if (notifyEmail) {
    try {
      const html = `
        <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
          <p style="margin-bottom:20px;">Dear Participant,</p>
          <p style="margin-bottom:16px;">Your proposed interview time has been declined by the other participant.</p>
          
          <div style="background:#fef3c7;padding:20px;border-radius:8px;border-left:4px solid #f59e0b;margin:24px 0;">
            <p style="margin:0 0 8px 0;font-size:14px;color:#78350f;"><strong>Declined Time:</strong></p>
            <p style="margin:0;font-size:16px;font-weight:600;color:#78350f;">${formatDateTime(latest)}</p>
            ${reason ? `<p style="margin:12px 0 0 0;font-size:14px;color:#78350f;"><strong>Reason:</strong> ${reason}</p>` : ''}
          </div>
          
          <div style="background:#dbeafe;padding:16px;border-radius:6px;margin:24px 0;border-left:3px solid #3b82f6;">
            <p style="margin:0;font-size:14px;color:#1e3a8a;"><strong>📝 Next Steps:</strong></p>
            <p style="margin:8px 0 0 0;font-size:14px;color:#1e3a8a;">Please log in to your dashboard and propose an alternative time that better accommodates both schedules.</p>
          </div>
          
          <p style="margin-top:28px;color:#64748b;font-size:14px;">We appreciate your flexibility in finding a mutually convenient time for the interview.</p>
          <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
        </div>
      `;
      
      await sendMail({
        to: notifyEmail,
        subject: 'Interview Time Proposal Declined - New Time Needed',
        html
      });
    } catch (e) {
      console.error('[rejectSlots] notify email failed:', e.message);
    }
  }
  
  res.json({ message: 'Latest proposal rejected and moved to past' });
}

async function sendMailForPair(pair) {
  if (!pair || !pair.scheduledAt) return;
  
  // Build ICS calendar attachment if scheduled
  let icsAttachment;
  const end = new Date(new Date(pair.scheduledAt).getTime() + 30 * 60 * 1000); // default 30 min
  const ics = buildICS({
    uid: `${pair._id}@interview-system`,
    start: pair.scheduledAt,
    end,
    summary: 'Interview Session',
    description: 'Scheduled interview session',
    url: pair.meetingLink,
    organizer: { name: pair.interviewer?.name || 'Interviewer', email: pair.interviewer?.email },
    attendees: [
      { name: pair.interviewer?.name || 'Interviewer', email: pair.interviewer?.email },
      { name: pair.interviewee?.name || 'Interviewee', email: pair.interviewee?.email },
    ].filter(a => a.email),
  });
  icsAttachment = [{ filename: 'interview.ics', content: ics, contentType: 'text/calendar; charset=utf-8; method=REQUEST' }];
  
  // Prepare event details
  const event = {
    title: 'Interview Session',
    date: formatDateTime(pair.scheduledAt),
    details: 'Your interview has been scheduled. Please join on time.',
  };
  
  // Create email promises for both parties
  const emailPromises = [];
  
  // Add scheduled interview email promises
  [pair.interviewer, pair.interviewee].forEach(participant => {
    if (!participant?.email) return;
    
    // Add interview details email
    emailPromises.push(
      sendInterviewScheduledEmail({
        to: participant.email,
        interviewer: pair.interviewer?.name || pair.interviewer?.email || 'Interviewer',
        interviewee: pair.interviewee?.name || pair.interviewee?.email || 'Interviewee',
        event,
        link: pair.meetingLink || 'Will be provided soon',
      }).catch(err => {
        console.error(`[sendMailForPair] Failed to send interview details to ${participant.email}:`, err.message);
        return null;
      })
    );
    
    // Add calendar invite
    emailPromises.push(
      sendMail({ 
        to: participant.email, 
        subject: 'Calendar Invite - Interview Session', 
        text: 'Please find the calendar invite attached.',
        attachments: icsAttachment 
      }).catch(err => {
        console.error(`[sendMailForPair] Failed to send calendar invite to ${participant.email}:`, err.message);
        return null;
      })
    );
  });
  
  // Send all emails in parallel
  await Promise.all(emailPromises);
  console.log('[Email] Interview scheduled emails and calendar invites sent to both parties');
}
