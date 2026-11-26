import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) email!: string;
  @Column() passwordHash!: string;
  @Column() name!: string;
  @Column() companyName!: string;
  /** Tour de bienvenida del CRM: null = aún no lo ha visto. */
  @Column({ type: 'varchar', nullable: true }) tourStatus!: 'completed' | 'skipped' | null;
  @Column({ type: 'timestamptz', nullable: true }) tourCompletedAt!: Date | null;
  /** Versión del tour que vio; si TOUR_VERSION sube, vuelve a mostrarse. */
  @Column({ type: 'int', default: 0 }) tourVersion!: number;
  @CreateDateColumn() createdAt!: Date;
}
