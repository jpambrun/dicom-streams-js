import { concat, emptyBuffer } from './base';
import { createFlow, DeferToPartFlow, GuaranteedValueEvent, InFragments } from './dicom-flow';
import {
    Element,
    FragmentElement,
    FragmentsElement,
    ItemDelimitationElement,
    ItemElement,
    preambleElement,
    SequenceDelimitationElement,
    SequenceElement,
    ValueElement,
} from './dicom-elements';
import {
    DicomPart,
    FragmentsPart,
    HeaderPart,
    ItemDelimitationPart,
    ItemPart,
    PreamblePart,
    SequenceDelimitationPart,
    SequencePart,
    ValueChunk,
} from './dicom-parts';
import { Value } from './value';

export function elementFlow(): any {
    return createFlow(
        new (class extends GuaranteedValueEvent(InFragments(DeferToPartFlow)) {
            private bytes: Buffer = emptyBuffer;
            private currentValue: ValueElement;
            private currentFragment: FragmentElement;
            private currentRange?: [number, number];

            public onPart(part: DicomPart): Element[] {
                if (part instanceof PreamblePart) {
                    return [preambleElement];
                }

                if (part instanceof HeaderPart) {
                    this.currentValue = new ValueElement(
                        part.tag,
                        part.vr,
                        Value.empty(),
                        part.bigEndian,
                        part.explicitVR,
                        undefined,
                    );
                    this.bytes = emptyBuffer;
                    this.currentRange = undefined;
                    return [];
                }

                if (part instanceof ItemPart && this.inFragments) {
                    this.currentFragment = new FragmentElement(part.length, Value.empty(), part.bigEndian);
                    this.bytes = emptyBuffer;
                    this.currentRange = undefined;
                    return [];
                }

                if (part instanceof ValueChunk) {
                    this.bytes = concat(this.bytes, part.bytes);
                    if (part.offset != null && part.length != null) {
                        if (!this.currentRange) {
                            this.currentRange = [part.offset, part.length];
                        } else {
                            const [off, len] = this.currentRange;
                            const newStart = Math.min(off, part.offset);
                            const newEnd = Math.max(off + len, part.offset + part.length);
                            this.currentRange = [newStart, newEnd - newStart];
                        }
                    }
                    if (part.last) {
                        if (this.inFragments) {
                            if (this.currentFragment === undefined) {
                                return [];
                            } else {
                                return [
                                    new FragmentElement(
                                        this.currentFragment.length,
                                        new Value(this.bytes),
                                        this.currentFragment.bigEndian,
                                        this.currentRange,
                                    ),
                                ];
                            }
                        } else {
                            return [
                                new ValueElement(
                                    this.currentValue.tag,
                                    this.currentValue.vr,
                                    new Value(this.bytes),
                                    this.currentValue.bigEndian,
                                    this.currentValue.explicitVR,
                                    this.currentRange,
                                ),
                            ];
                        }
                    } else {
                        return [];
                    }
                }

                if (part instanceof SequencePart) {
                    return [new SequenceElement(part.tag, part.length, part.bigEndian, part.explicitVR)];
                }

                if (part instanceof FragmentsPart) {
                    return [new FragmentsElement(part.tag, part.vr, part.bigEndian, part.explicitVR)];
                }

                if (part instanceof ItemPart) {
                    return [new ItemElement(part.length, part.bigEndian)];
                }

                if (part instanceof ItemDelimitationPart) {
                    return [new ItemDelimitationElement(part.bigEndian)];
                }

                if (part instanceof SequenceDelimitationPart) {
                    return [new SequenceDelimitationElement(part.bigEndian)];
                }

                return [];
            }
        })(),
    );
}
