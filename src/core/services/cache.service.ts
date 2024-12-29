import Redis from 'ioredis';
import { logger } from '@config/logger';

export class CacheService {
  private static redis: Redis | null = null;
  private static DEFAULT_TTL = 3600; // 1 hour in seconds
  private static isConnected = false;
  private static readonly MAX_RETRIES = 5;
  private static retryCount = 0;

  static async initialize() {
    try {
      if (this.redis) {
        return;
      }

      const redisConfig = {
        host: process.env.REDIS_HOST || 'redis', // Use service name from docker-compose
        port: parseInt(process.env.REDIS_PORT || '6379'),
        retryStrategy(times: number) {
          const delay = Math.min(times * 500, 2000);
          return delay;
        },
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        retryUnlessNotFound: true,
        reconnectOnError: (err: Error) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true;
          }
          return false;
        },
        showFriendlyErrorStack: process.env.NODE_ENV !== 'production'
      };

      console.log('🔄 Attempting to connect to Redis with config:', {
        host: redisConfig.host,
        port: redisConfig.port
      });

      this.redis = new Redis(redisConfig);

      this.redis.on('connect', () => {
        this.isConnected = true;
        this.retryCount = 0;
        console.log('🚀 Redis connected successfully');
        logger.info('Redis connected successfully');
      });

      this.redis.on('error', (error) => {
        this.isConnected = false;
        console.error('❌ Redis connection error:', error);
        logger.error('Redis connection error:', error);
        
        if (this.retryCount < this.MAX_RETRIES) {
          this.retryCount++;
          console.log(`🔄 Retry attempt ${this.retryCount} of ${this.MAX_RETRIES}`);
          setTimeout(() => this.initialize(), 1000 * this.retryCount);
        } else {
          console.error('❌ Max retry attempts reached. Operating without cache.');
        }
      });

      this.redis.on('ready', () => {
        this.isConnected = true;
        console.log('✅ Redis is ready to accept commands');
        logger.info('Redis is ready to accept commands');
      });

      // Test the connection
      await this.redis.ping();
    } catch (error) {
      this.isConnected = false;
      logger.error('Redis initialization failed:', error);
      console.error('❌ Redis initialization failed:', error);
      
      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        console.log(`🔄 Retry attempt ${this.retryCount} of ${this.MAX_RETRIES}`);
        setTimeout(() => this.initialize(), 1000 * this.retryCount);
      }
    }
  }

  private static async ensureConnection(): Promise<boolean> {
    if (!this.redis || !this.isConnected) {
      console.log('⚠️ Redis not connected, operating without cache');
      return false;
    }
    return true;
  }

  static async get<T>(key: string): Promise<T | null> {
    try {
      if (!await this.ensureConnection()) return null;

      console.log('🔍 Cache lookup for key:', key);
      const data = await this.redis!.get(key);
      
      console.log('📦 Cache data found:', data ? 'Hit' : 'Miss');
      if (data) {
        console.log('📄 Cache data sample:', data.substring(0, 100) + '...');
      }
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      console.error('❌ Cache get error:', error);
      return null;
    }
  }

  static async set(key: string, value: any, ttl: number = this.DEFAULT_TTL): Promise<void> {
    try {
      if (!await this.ensureConnection()) return;

      await this.redis!.setex(key, ttl, JSON.stringify(value));
      console.log('💾 Cache set for key:', key);
      console.log('⏱️ TTL set to:', ttl, 'seconds');
    } catch (error) {
      logger.error('Cache set error:', error);
      console.error('❌ Cache set error:', error);
    }
  }

  static async del(key: string): Promise<void> {
    try {
      if (!await this.ensureConnection()) return;

      await this.redis!.del(key);
      console.log('🗑️ Cache deleted for key:', key);
    } catch (error) {
      logger.error('Cache delete error:', error);
      console.error('❌ Cache delete error:', error);
    }
  }

  static generateKey(prefix: string, params: Record<string, any> = {}): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as Record<string, any>);

    const key = `${prefix}:${JSON.stringify(sortedParams)}`;
    console.log('🔑 Generated cache key:', key);
    return key;
  }

  static async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.isConnected = false;
      console.log('👋 Redis disconnected');
      logger.info('Redis disconnected');
    }
  }

  static async delByPattern(pattern: string): Promise<void> {
    try {
      if (!await this.ensureConnection()) return;
      
      const keys = await this.redis!.keys(pattern);
      if (keys.length > 0) {
        await this.redis!.del(...keys);
      }
      console.log('🗑️ Cache deleted for pattern:', pattern);
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
      console.error('❌ Cache delete pattern error:', error);
    }
  }
} 