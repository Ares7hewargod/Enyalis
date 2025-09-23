// In-memory data stores (replace with database in production)
const users = [];
const servers = [];
const channels = [];
const messages = [];
const directMessages = [];
const friendships = [];
const friendRequests = [];
const serverMembers = [];
const roles = [];

// Data Models Structure:

/**
 * User Model
 * {
 *   id: number,
 *   username: string,
 *   email: string,
 *   password: string (hashed),
 *   avatar: string (URL/path),
 *   status: 'online' | 'away' | 'busy' | 'offline',
 *   createdAt: Date
 * }
 */

/**
 * Server Model
 * {
 *   id: number,
 *   name: string,
 *   description: string,
 *   icon: string (URL/path),
 *   ownerId: number,
 *   inviteCode: string,
 *   createdAt: Date
 * }
 */

/**
 * Channel Model
 * {
 *   id: number,
 *   serverId: number,
 *   name: string,
 *   type: 'text' | 'voice',
 *   position: number,
 *   createdAt: Date
 * }
 */

/**
 * Message Model
 * {
 *   id: number,
 *   userId: number,
 *   channelId: number,
 *   content: string,
 *   attachments: [{ type: 'image', url: string, filename: string }],
 *   timestamp: Date,
 *   edited: boolean,
 *   editedAt: Date
 * }
 */

/**
 * Friendship Model
 * {
 *   id: number,
 *   senderId: number,
 *   receiverId: number,
 *   status: 'pending' | 'accepted' | 'blocked',
 *   createdAt: Date
 * }
 */

/**
 * ServerMember Model
 * {
 *   id: number,
 *   serverId: number,
 *   userId: number,
 *   role: 'owner' | 'admin' | 'member',
 *   roleId: number (optional, custom role ID),
 *   joinedAt: Date
 * }
 */

/**
 * Role Model
 * {
 *   id: number,
 *   serverId: number,
 *   name: string,
 *   color: string (hex color),
 *   permissions: string[] (array of permission strings),
 *   position: number (higher = more priority),
 *   isDefault: boolean,
 *   createdAt: Date
 * }
 */

// Generate unique IDs
const generateId = () => Date.now() + Math.random();

// Generate invite codes
const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

module.exports = {
    users,
    servers,
    channels,
    messages,
    directMessages,
    friendships,
    friendRequests,
    serverMembers,
    roles,
    generateId,
    generateInviteCode
};