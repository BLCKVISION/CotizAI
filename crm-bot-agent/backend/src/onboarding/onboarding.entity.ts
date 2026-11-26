import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export const TOTAL_STEPS = 5;

@Entity('onboardings')
export class Onboarding {
  @PrimaryColumn('uuid') userId!: string;
  @Column({ default: 1 }) currentStep!: number;
  @Column({ default: false }) whatsappConnected!: boolean;
  @Column({ type: 'jsonb', default: {} }) data!: Record<string, Record<string, unknown>>;
  @Column({ type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @UpdateDateColumn() updatedAt!: Date;
}
