import { concat, concatv, emptyBuffer, item, pipe, sequenceDelimitation } from '../src/base';
import { elementFlow } from '../src/element-flows';
import { parseFlow } from '../src/parse-flow';
import { Tag } from '../src/tag';
import * as data from './test-data';
import * as util from './test-util';

describe('A DICOM elements flow', () => {
    it('should combine headers and value chunks into elements', () => {
        const bytes = concat(data.patientNameJohnDoe(), data.studyDate());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), (elements) => {
            util.elementProbe(elements)
                .expectElement(Tag.PatientName)
                .expectElement(Tag.StudyDate)
                .expectDicomComplete();
        });
    });

    it('should combine items in fragments into fragment elements', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(4),
            Buffer.from([1, 2, 3, 4]),
            item(4),
            Buffer.from([5, 6, 7, 8]),
            sequenceDelimitation(),
        );

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), (elements) => {
            util.elementProbe(elements)
                .expectFragments(Tag.PixelData)
                .expectFragment(4)
                .expectFragment(4)
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it('should handle elements and fragments of zero length', () => {
        const bytes = concatv(
            Buffer.from([8, 0, 32, 0, 68, 65, 0, 0]),
            data.patientNameJohnDoe(),
            data.pixeDataFragments(),
            item(0),
            item(4),
            Buffer.from([5, 6, 7, 8]),
            sequenceDelimitation(),
        );

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), (elements) => {
            util.elementProbe(elements)
                .expectElement(Tag.StudyDate, emptyBuffer)
                .expectElement(Tag.PatientName, Buffer.from('John^Doe'))
                .expectFragments(Tag.PixelData)
                .expectFragment(0)
                .expectFragment(4)
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });

    it('should handle determinate length sequences and items', () => {
        const bytes = concatv(data.sequence(Tag.DerivationCodeSequence, 24), item(16), data.patientNameJohnDoe());

        return util.testParts(bytes, pipe(parseFlow(), elementFlow()), (elements) => {
            util.elementProbe(elements)
                .expectSequence(Tag.DerivationCodeSequence, 24)
                .expectItem(16)
                .expectElement(Tag.PatientName)
                .expectDicomComplete();
        });
    });

    it('should include a single combined byte range on ValueElement from parseFlow ValueChunks', () => {
        const long = Buffer.from('HelloWorldAndMoreData'); // 21 bytes (PN gets padded to even length)
        const bytes = data.element(Tag.PatientName, long);
        const chunkSize = 8;
        const expectedPadded = Buffer.concat([long, Buffer.from([0x20])]);
    // Expect chunks: header 8 bytes, then offsets 8/len8, 16/len8, 24/len6
    // Combined range should be [8, 22]
        return util.testParts(bytes, pipe(parseFlow(chunkSize), elementFlow()), (elements) => {
            util
                .elementProbe(elements)
        .expectElementWithRange(Tag.PatientName, [8, 22], expectedPadded)
                .expectDicomComplete();
        });
    });

    it('should include a single combined byte range on FragmentElement from parseFlow ValueChunks', () => {
        const bytes = concatv(
            data.pixeDataFragments(),
            item(10),
            Buffer.from('0123456789'),
            item(3),
            Buffer.from('abc'),
            sequenceDelimitation(),
        );
        const chunkSize = 4;
        // For first fragment length 10: header (item) 8 bytes at stream position after fragments header.
        // Ranges will combine across chunks with size 4,4,2 within the fragment value region.
        return util.testParts(bytes, pipe(parseFlow(chunkSize), elementFlow()), (elements) => {
            util
                .elementProbe(elements)
                .expectFragments(Tag.PixelData)
                .expectFragmentWithRange(10, [
                    // Offsets depend on total preceding header sizes:
                    // pixeDataFragments() is a header of 12 bytes for FragmentsPart.
                    // item(10) adds 8 bytes, then value chunks start at offset 12+8 = 20.
                    20, 10,
                ])
                .expectFragmentWithRange(3, [
                    // next item header at offset 12 + (8 + 10) + 8 = 38, value starts at 38
                    38, 3,
                ])
                .expectSequenceDelimitation()
                .expectDicomComplete();
        });
    });
});
