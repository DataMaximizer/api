import {
  User,
  IUser,
  CreateUserInput,
  UpdateUserInput,
  UserType,
} from "./models/user.model";
import { FilterQuery } from "mongoose";
import { CacheService } from "@core/services/cache.service";

const CACHE_TTL = 3600; // 1 hour in seconds
const USER_CACHE_PREFIX = "user";
const USERS_LIST_CACHE_KEY = "users:list";

export class UserService {
  static async getUsers(filter: FilterQuery<IUser> = {}) {
    try {
      // Try to get from cache first
      const cacheKey = CacheService.generateKey(USERS_LIST_CACHE_KEY, filter);
      const cachedUsers = await CacheService.get<IUser[]>(cacheKey);

      if (cachedUsers) {
        return cachedUsers;
      }

      const users = await User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 });

      // Cache the result
      await CacheService.set(cacheKey, users, CACHE_TTL);

      return users;
    } catch (error) {
      throw new Error("Error fetching users");
    }
  }

  static async getUserById(id: string) {
    try {
      // Try to get from cache first
      const cacheKey = CacheService.generateKey(USER_CACHE_PREFIX, { id });
      const cachedUser = await CacheService.get<IUser>(cacheKey);

      if (cachedUser) {
        return cachedUser;
      }

      const user = await User.findById(id).select("-password");
      if (!user) {
        throw new Error("User not found");
      }

      // Cache the result
      await CacheService.set(cacheKey, user, CACHE_TTL);

      return user;
    } catch (error) {
      throw new Error("Error fetching user");
    }
  }

  static async updateUser(id: string, input: UpdateUserInput) {
    try {
      const user = await User.findById(id);
      if (!user) {
        throw new Error("User not found");
      }

      Object.assign(user, input);
      await user.save();

      // Invalidate user cache
      const userCacheKey = CacheService.generateKey(USER_CACHE_PREFIX, { id });
      await CacheService.del(userCacheKey);
      await CacheService.delByPattern(`${USERS_LIST_CACHE_KEY}:*`);

      return user;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === 11000) {
        throw new Error("Email or document already exists");
      }
      throw new Error("Error updating user");
    }
  }

  static async deleteUser(id: string) {
    try {
      const user = await User.findById(id);
      if (!user) {
        throw new Error("User not found");
      }
      await user.softDelete();

      // Invalidate user cache
      const userCacheKey = CacheService.generateKey(USER_CACHE_PREFIX, { id });
      await CacheService.del(userCacheKey);
      await CacheService.delByPattern(`${USERS_LIST_CACHE_KEY}:*`);

      return user;
    } catch (error) {
      throw new Error("Error deleting user");
    }
  }

  static async getUserApiKeys(id: string) {
    try {
      const user = await User.findById(id).select("openAiKey claudeKey");
      if (!user) {
        throw new Error("User not found");
      }

      let apiKeys = {
        openAiKey: user.openAiKey || "",
        claudeKey: user.claudeKey || "",
      };

      // If the user doesn't have API keys, try to get them from an admin user
      if (!apiKeys.openAiKey || !apiKeys.claudeKey) {
        const adminUser = await User.findOne({ type: UserType.ADMIN })
          .select("openAiKey claudeKey")
          .sort({ createdAt: 1 }); // Get the first admin by creation date

        if (adminUser) {
          // Only use admin keys for fields that are empty
          apiKeys = {
            openAiKey: user.openAiKey || adminUser.openAiKey || "",
            claudeKey: user.claudeKey || adminUser.claudeKey || "",
          };
        }
      }

      return apiKeys;
    } catch (error) {
      throw new Error("Error fetching user API keys");
    }
  }

  static async updateUserApiKeys(
    id: string,
    keys: { openAiKey?: string; claudeKey?: string }
  ) {
    try {
      const user = await User.findById(id);
      if (!user) {
        throw new Error("User not found");
      }

      // Update only the provided keys
      if (keys.openAiKey) {
        user.openAiKey = keys.openAiKey;
      }
      if (keys.claudeKey) {
        user.claudeKey = keys.claudeKey;
      }

      await user.save();

      return {
        openAiKey: user.openAiKey || "",
        claudeKey: user.claudeKey || "",
      };
    } catch (error) {
      throw new Error("Error updating user API keys");
    }
  }
}
