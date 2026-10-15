import { Admin, Consumer, Producer } from "kafkajs";
import { Kafka } from 'kafkajs';

class KafkaSingleton {
    private static instance: KafkaSingleton;
    private kafka!:  Kafka;
    private producer!: Producer;
    private admin!: Admin;
    private consumer!: Consumer;
    constructor(broker:string) {
        if (!KafkaSingleton.instance) {
            console.log("Given Broeker ..............",broker)
            this.kafka = new Kafka({
                brokers: [broker], // Change to your broker address
                connectionTimeout: 10000,
            });

            KafkaSingleton.instance = this;
            this.admin = this.kafka.admin();
            this.producer = this.kafka.producer();
            this.consumer = this.kafka.consumer({ groupId: `client${process.env.SYS_ID}`});
            this.producer.connect();
            this.consumer.connect();
        }

        return KafkaSingleton.instance;
    }

    async createTopic(topicName:string) {
        try {
            await this.admin.connect();
            await this.admin.createTopics({
                topics: [{ topic: topicName, numPartitions: 1, replicationFactor: 1 }],
            });
            console.log(`Topic "${topicName}" created successfully.`);
        } catch (error) {
            console.error(`Failed to create topic "${topicName}":`, error);
        } finally {
            // await this.admin.disconnect();
        }
    }

    async deleteTopic(topicName: string) {
        try {
            await this.admin.connect();
            await this.admin.deleteTopics({ topics: [topicName] });
            // console.log(`Topic "${topicName}" deleted successfully.`);
        } catch (error) {
            console.error(`Failed to delete topic "${topicName}":`, error);
        } finally {
            // await this.admin.disconnect();
        }
    }

    async sendMessage(topicName: string, message:string) {
        try {
            await this.producer.send({
                topic: topicName,
                messages: [{ value: message }],
            });
            // console.log(`Message sent to topic "${topicName}"`);
        } catch (error) {
            console.error(`Failed to send message to "${topicName}":`, error);
        }
    }

    async receiveMessages(topicName: string, callback:(arg:{})=>{}) {
        try {
            await this.consumer.stop();
            await this.consumer.subscribe({ topic: topicName, fromBeginning: false });
            await this.consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    callback({ topic, partition, message: message?.value?.toString() })
                },
            });
        } catch (err) {
            console.log("message didnt processed", topicName,err)
        }
    }



    async topicExists(topicName: string): Promise<boolean> {
        await this.admin.connect();

        try {
            const metadata = await this.admin.fetchTopicMetadata();
            const topicMetadata = await metadata.topics.find(topic => topic.name === topicName);

            if (topicMetadata) {
                console.log(`Topic "${topicName}" exists.`);
                return true;
            } else {
                console.log(`Topic "${topicName}" does not exist.`);
                return false;
            }
        } catch (error) {
            console.error(`Failed to check existence of topic ${error instanceof Error ? error.message : "Unknown error occurred"}`);
            return false;
        } finally {
            //   await this.admin.disconnect();
        }
    }
}

export { KafkaSingleton };


