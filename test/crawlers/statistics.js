import { expect } from 'chai';
import sinon from 'sinon';
import log from 'apify-shared/log';
import Statistics from '../../build/crawlers/statistics';

describe('Statistics', () => {
    const getPerMinute = (jobCount, totalTickMillis) => {
        return Math.round(jobCount / (totalTickMillis / 1000 / 60));
    };

    let clock;
    let stats;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
        stats = new Statistics();
    });

    afterEach(() => {
        clock.restore();
        stats = null;
        clock = null;
    });

    it('should finish a job', () => {
        stats.startJob(0);
        clock.tick(1);
        stats.finishJob(0);
        clock.tick(1);
        const current = stats.getCurrent();
        expect(current).to.be.eql({
            avgDurationMillis: 1,
            perMinute: getPerMinute(1, 2),
            finished: 1,
            failed: 0,
            retryHistogram: [1],
        });
    });

    it('should fail a job', () => {
        stats.startJob(0);
        clock.tick(0);
        stats.failJob(0);
        clock.tick(1);
        const current = stats.getCurrent();
        expect(current).to.be.eql({
            avgDurationMillis: Infinity,
            perMinute: 0,
            finished: 0,
            failed: 1,
            retryHistogram: [1],
        });
    });

    it('should collect retries', () => {
        stats.startJob(0);
        stats.startJob(1);
        stats.startJob(2);
        stats.finishJob(0);
        stats.startJob(1);
        stats.startJob(2);
        stats.finishJob(1);
        stats.startJob(2);
        stats.finishJob(2);
        const current = stats.getCurrent();
        expect(current).to.be.eql({
            avgDurationMillis: Infinity,
            perMinute: Infinity,
            finished: 3,
            failed: 0,
            retryHistogram: [1, 1, 1],
        });
    });

    it('should return correct stats for multiple parallel jobs', () => {
        stats.startJob(0);
        clock.tick(1);
        stats.startJob(1);
        clock.tick(1);
        stats.startJob(2);
        clock.tick(2);
        stats.finishJob(1); // runtime: 3ms
        clock.tick(1); // since startedAt: 5ms
        stats.failJob(0); // runtime: irrelevant
        clock.tick(10);
        stats.finishJob(2); // runtime: 13ms
        clock.tick(10); // since startedAt: 25ms

        const current = stats.getCurrent();
        expect(current).to.be.eql({
            avgDurationMillis: (13 + 3) / 2,
            perMinute: getPerMinute(2, 25),
            finished: 2,
            failed: 1,
            retryHistogram: [3],
        });
    });

    it('should regularly log stats', () => {
        const logged = [];
        sinon.stub(log, 'info').callsFake((...args) => {
            logged.push(args);
        });

        stats.startJob(0);
        clock.tick(1);
        stats.finishJob(0);
        stats.startLogging();
        clock.tick(50000);
        expect(logged).to.have.lengthOf(0);
        clock.tick(10001);
        expect(logged).to.have.lengthOf(1);
        expect(logged[0][0]).to.eql('Statistics');
        expect(logged[0][1]).to.eql({
            avgDurationMillis: 1,
            perMinute: 1,
            finished: 1,
            failed: 0,
            retryHistogram: [1],
        });
        stats.stopLogging();
        clock.tick(60001);
        expect(logged).to.have.lengthOf(1);
        expect(logged[0][0]).to.eql('Statistics');
        expect(logged[0][1]).to.eql({
            avgDurationMillis: 1,
            perMinute: 1,
            finished: 1,
            failed: 0,
            retryHistogram: [1],
        });
    });
});
