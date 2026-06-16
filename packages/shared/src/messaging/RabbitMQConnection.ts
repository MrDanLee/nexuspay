import amqp from 'amqplib';
import { Logger } from 'pino';

/**
 * RabbitMQ connection manager with auto-reconnect.
 *
 * Manages a single connection and channel to RabbitMQ,
 * automatically reconnecting on connection loss. Services
 * should use a single instance of this class.
 */
export class RabbitMQConnection {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private reconnecting = false;
  private reconnectAttempts = 0;
  private readonly reconnectDelay = 5000;

  constructor(
    private readonly url: string,
    private readonly logger: Logger,
  ) { }

  /** Host:port from the AMQP URL, for actionable logs without leaking credentials. */
  private get endpoint(): string {
    try {
      const url = new URL(this.url);
      return `${url.hostname}:${url.port || '5672'}`;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Establish connection and create a channel.
   */
  async connect(): Promise<void> {
    try {
      this.logger.info({ endpoint: this.endpoint }, 'Connecting to RabbitMQ...');

      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      // Prefetch 1 message at a time for fair dispatch
      await this.channel.prefetch(1);

      this.reconnectAttempts = 0;
      this.logger.info({ endpoint: this.endpoint }, 'Connected to RabbitMQ');

      // Handle connection errors
      this.connection.on('error', (err: Error) => {
        this.logger.error({ err }, 'RabbitMQ connection error');
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.handleDisconnect();
      });
    } catch (error) {
      this.logger.error(
        { err: error, endpoint: this.endpoint },
        `Failed to connect to RabbitMQ at ${this.endpoint}. Is the broker running and reachable?`,
      );
      throw error;
    }
  }

  /**
   * Get the current channel. Throws if not connected.
   */
  getChannel(): amqp.Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not available. Call connect() first.');
    }
    return this.channel;
  }

  /**
   * Check if the connection is active.
   */
  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  /**
   * Gracefully close the connection.
   */
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.logger.info('RabbitMQ connection closed gracefully');
    } catch (error) {
      this.logger.error({ err: error }, 'Error closing RabbitMQ connection');
    }
  }

  /**
   * Handle unexpected disconnection with auto-reconnect.
   */
  private handleDisconnect(): void {
    this.channel = null;
    this.connection = null;

    if (this.reconnecting) return;
    this.reconnecting = true;
    this.reconnectAttempts += 1;

    this.logger.warn(
      { delayMs: this.reconnectDelay, attempt: this.reconnectAttempts, endpoint: this.endpoint },
      `RabbitMQ disconnected; reconnect attempt ${this.reconnectAttempts} in ${this.reconnectDelay}ms`,
    );

    setTimeout(async () => {
      try {
        await this.connect();
        this.reconnecting = false;
      } catch {
        this.reconnecting = false;
        this.handleDisconnect();
      }
    }, this.reconnectDelay);
  }
}